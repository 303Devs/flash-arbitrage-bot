/**
 * DEX Swap Calldata Builder
 *
 * Encodes the exact ABI-calldata for each DEX router.
 * The contract executes: dex.call{gas: 400000}(swapData)
 * so swapData must be a complete ABI-encoded function call.
 *
 * Supported DEX types:
 * - uniswap-v3:  exactInputSingle (Uniswap V3, PancakeSwap V3)
 * - uniswap-v2:  swapExactTokensForTokens (SushiSwap, QuickSwap)
 * - camelot:     swapExactTokensForTokens with referrer param
 * - aerodrome:   swapExactTokensForTokens with Route[] struct
 * - balancer:    swap (single swap via vault)
 */

import { ethers } from 'ethers';

export interface SwapParams {
  tokenIn:          string;
  tokenOut:         string;
  amountIn:         bigint;
  amountOutMinimum: bigint;   // 0 = no slippage protection (simulation only)
  recipient:        string;   // The arbitrage contract address
  fee?:             number;   // V3 fee tier (500, 3000, 10000)
  poolId?:          string;   // Balancer pool ID
  stable?:          boolean;  // Aerodrome: use stable pool
  factory?:         string;   // Aerodrome: factory address
}

// ---- Interface fragments ----

const V3_IFACE = new ethers.Interface([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
]);

const V2_IFACE = new ethers.Interface([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
]);

// Camelot adds a referrer address before deadline
const CAMELOT_IFACE = new ethers.Interface([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, address referrer, uint256 deadline) external returns (uint256[] memory amounts)',
]);

// Aerodrome uses a Route struct instead of address[] path
const AERODROME_IFACE = new ethers.Interface([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts)',
]);

// Balancer single-swap
const BALANCER_IFACE = new ethers.Interface([
  'function swap((bytes32 poolId, uint8 kind, address assetIn, address assetOut, uint256 amount, bytes userData) singleSwap, (address sender, bool fromInternalBalance, address payable recipient, bool toInternalBalance) funds, uint256 limit, uint256 deadline) external payable returns (uint256 amountCalculated)',
]);

// ---- Deadline helper ----
// Use 5 minutes from now. The tx should confirm in seconds, so this is generous.
function deadline(): number {
  return Math.floor(Date.now() / 1000) + 300;
}

// ---- Builders ----

export function buildV3Calldata(params: SwapParams): string {
  return V3_IFACE.encodeFunctionData('exactInputSingle', [{
    tokenIn:          params.tokenIn,
    tokenOut:         params.tokenOut,
    fee:              params.fee ?? 3000,
    recipient:        params.recipient,
    deadline:         deadline(),
    amountIn:         params.amountIn,
    amountOutMinimum: params.amountOutMinimum,
    sqrtPriceLimitX96: 0n,
  }]);
}

export function buildV2Calldata(params: SwapParams): string {
  return V2_IFACE.encodeFunctionData('swapExactTokensForTokens', [
    params.amountIn,
    params.amountOutMinimum,
    [params.tokenIn, params.tokenOut],
    params.recipient,
    deadline(),
  ]);
}

export function buildCamelotCalldata(params: SwapParams): string {
  return CAMELOT_IFACE.encodeFunctionData('swapExactTokensForTokens', [
    params.amountIn,
    params.amountOutMinimum,
    [params.tokenIn, params.tokenOut],
    params.recipient,
    ethers.ZeroAddress, // referrer
    deadline(),
  ]);
}

export function buildAerodromeCalldata(params: SwapParams, factory: string): string {
  return AERODROME_IFACE.encodeFunctionData('swapExactTokensForTokens', [
    params.amountIn,
    params.amountOutMinimum,
    [{ from: params.tokenIn, to: params.tokenOut, stable: params.stable ?? false, factory }],
    params.recipient,
    deadline(),
  ]);
}

export function buildBalancerCalldata(params: SwapParams): string {
  if (!params.poolId) throw new Error('Balancer swap requires poolId');

  return BALANCER_IFACE.encodeFunctionData('swap', [
    {
      poolId:   params.poolId,
      kind:     0, // GIVEN_IN
      assetIn:  params.tokenIn,
      assetOut: params.tokenOut,
      amount:   params.amountIn,
      userData: '0x',
    },
    {
      sender:             params.recipient,
      fromInternalBalance: false,
      recipient:          params.recipient,
      toInternalBalance:  false,
    },
    params.amountOutMinimum,
    deadline(),
  ]);
}

/**
 * Build swap calldata for any supported DEX type.
 * Pass dexType from DEXConfig.type + dexId for special cases.
 */
export function buildSwapCalldata(
  dexType:   'uniswap-v3' | 'uniswap-v2' | 'balancer' | 'camelot' | 'aerodrome' | 'curve' | 'custom',
  dexId:     string,
  params:    SwapParams,
  extraData?: { factory?: string }
): string {
  switch (dexType) {
    case 'uniswap-v3':
      return buildV3Calldata(params);

    case 'uniswap-v2':
      return buildV2Calldata(params);

    case 'balancer':
      return buildBalancerCalldata(params);

    case 'camelot':
    case 'custom':
      // Camelot has a referrer param; Aerodrome has routes struct
      if (dexId === 'camelot') return buildCamelotCalldata(params);
      if (dexId === 'aerodrome') return buildAerodromeCalldata(params, extraData?.factory ?? ethers.ZeroAddress);
      // Unknown custom DEX - try V2 style as fallback
      return buildV2Calldata(params);

    case 'curve':
      // Curve's router interface varies by pool type. For now fall through to V2-style
      // as Curve is rarely the best arbitrage DEX for simple token pairs.
      // TODO: Implement Curve exchange() calldata for stablecoin pools
      throw new Error(`Curve calldata not yet implemented for pair ${params.tokenIn}/${params.tokenOut}`);

    default:
      throw new Error(`Unknown DEX type: ${dexType}`);
  }
}

/**
 * Apply slippage tolerance to an expected output amount.
 * Default: 0.5% slippage (50 bps)
 */
export function withSlippage(amountOut: bigint, bps = 50): bigint {
  return amountOut * BigInt(10000 - bps) / 10000n;
}
