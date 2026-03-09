import fs from 'fs/promises';

// ============================================================================
// CONFIGURATION
// ============================================================================

// TODO: Paste your chains array here
const chains = [
  { name: 'BNB_Chain', 
    id: 'bsc',
    dexs: [
    {
      id: "pancakeswap_v2",
      name: "Pancakeswap V2 (BSC)"
    },
    {
      id: "jswap_bsc",
      name: "Jswap (BSC)"
    },
    {
      id: "apeswap_bsc",
      name: "ApeSwap (BSC)"
    },
    {
      id: "mdex_bsc",
      name: "MDEX (BSC)"
    },
    {
      id: "biswap",
      name: "Biswap V2"
    },
    {
      id: "sushiswap_bsc",
      name: "Sushiswap (BSC)"
    },
    {
      id: "firebird_bsc",
      name: "Firebird (BSC)"
    },
    {
      id: "impossible_finance",
      name: "Impossible Finance v2"
    },
    {
      id: "babyswap",
      name: "BabySwap"
    },
    {
      id: "wault_finance",
      name: "Wault Finance"
    },
    {
      id: "mars_ecosystem",
      name: "Mars Ecosystem"
    },
    {
      id: "jetswap_bsc",
      name: "Jetswap (BSC)"
    },
    {
      id: "elk_finance_bsc",
      name: "Elk Finance (BSC)"
    },
    {
      id: "annex_finance_bsc",
      name: "Annex Finance (BSC)"
    },
    {
      id: "autoshark_finance",
      name: "AutoShark Finance"
    },
    {
      id: "julswap",
      name: "JulSwap"
    },
    {
      id: "leonicornswap",
      name: "LeonicornSwap"
    },
    {
      id: "yoshi_exchange_bsc",
      name: "Yoshi.exchange (BSC)"
    },
    {
      id: "empiredex_bsc",
      name: "EmpireDEX (BSC)"
    },
    {
      id: "polkaex_bsc",
      name: "PolkaEx (BSC)"
    },
    {
      id: "knightswap",
      name: "KnightSwap"
    },
    {
      id: "impossible_finance_v3",
      name: "Impossible Finance v3"
    },
    {
      id: "moonlift",
      name: "Moonlift"
    },
    {
      id: "sphynx_swap",
      name: "Sphynx Swap"
    },
    {
      id: "justmoney_bsc",
      name: "Justmoney (BSC)"
    },
    {
      id: "radioshack_bsc",
      name: "RadioShack (BSC)"
    },
    {
      id: "pyeswap_bsc",
      name: "PYESwap (BSC)"
    },
    {
      id: "bakeryswap",
      name: "BakerySwap"
    },
    {
      id: "pls2e",
      name: "PLS2E"
    },
    {
      id: "winery_swap",
      name: "Winery Swap"
    },
    {
      id: "nomiswap",
      name: "Nomiswap"
    },
    {
      id: "safemoon_swap",
      name: "SafeMoon Swap"
    },
    {
      id: "fstswap",
      name: "Fstswap"
    },
    {
      id: "dddx",
      name: "DDDX"
    },
    {
      id: "swych",
      name: "SWYCH"
    },
    {
      id: "orbitalswap",
      name: "OrbitalSwap"
    },
    {
      id: "pandora_digital_swap",
      name: "Pandora Digital Swap"
    },
    {
      id: "fraxswap_bsc",
      name: "Fraxswap (BSC)"
    },
    {
      id: "bridges",
      name: "Bridges"
    },
    {
      id: "whaleswap",
      name: "WhaleSwap"
    },
    {
      id: "pinkswap",
      name: "Pinkswap"
    },
    {
      id: "baryon_network",
      name: "BaryonSwap"
    },
    {
      id: "dooar_bsc",
      name: "DOOAR (BSC)"
    },
    {
      id: "spice_trade_bsc",
      name: "Spice Trade (BSC)"
    },
    {
      id: "kyberswap_elastic_bsc",
      name: "Kyberswap Elastic (BSC)"
    },
    {
      id: "cone_exchange",
      name: "Cone Exchange"
    },
    {
      id: "alium",
      name: "Alium"
    },
    {
      id: "dao_swap",
      name: "DAO Swap"
    },
    {
      id: "ellipsis_finance",
      name: "Ellipsis Finance"
    },
    {
      id: "planet_finance",
      name: "Planet Finance"
    },
    {
      id: "babydogeswap",
      name: "BabyDogeSwap"
    },
    {
      id: "nomiswap_stable",
      name: "Nomiswap (Stable)"
    },
    {
      id: "kyberswap_classic_bsc",
      name: "Kyberswap Classic (BSC)"
    },
    {
      id: "cakewswap_bsc",
      name: "CakeWSwap (BSC)"
    },
    {
      id: "corgiswap",
      name: "CorgiSwap"
    },
    {
      id: "dinosaureggs",
      name: "DinosaurEggs"
    },
    {
      id: "niob",
      name: "Niob"
    },
    {
      id: "padswap-bsc",
      name: "Padswap (BSC)"
    },
    {
      id: "w3swap",
      name: "W3Swap"
    },
    {
      id: "openocean",
      name: "OpenOcean"
    },
    {
      id: "thena",
      name: "THENA"
    },
    {
      id: "kyotoswap",
      name: "KyotoSwap"
    },
    {
      id: "lif3-bsc",
      name: "lif3 (BSC)"
    },
    {
      id: "pancakeswap_stableswap",
      name: "Pancakeswap (Stable)"
    },
    {
      id: "traderjoe-bsc",
      name: "LFJ (BSC)"
    },
    {
      id: "traderjoe-v2-bsc",
      name: "LFJ V2 (BSC)"
    },
    {
      id: "archly-bsc",
      name: "Archly (BSC)"
    },
    {
      id: "definix",
      name: "Definix"
    },
    {
      id: "uniswap-bsc",
      name: "Uniswap V3 (BSC)"
    },
    {
      id: "iziswap-bsc",
      name: "iZiSwap (BSC)"
    },
    {
      id: "pancakeswap-v3-bsc",
      name: "Pancakeswap V3 (BSC)"
    },
    {
      id: "traderjoe-v2-1-bsc",
      name: "LFJ V2.1 (BSC)"
    },
    {
      id: "thena-fusion",
      name: "THENA FUSION"
    },
    {
      id: "saitaswap-bsc",
      name: "Saitaswap (BSC)"
    },
    {
      id: "hkswap",
      name: "HKSwap"
    },
    {
      id: "stronghands-dex-v2",
      name: "StrongHands DEX V2"
    },
    {
      id: "surge-protocol-bsc",
      name: "Surge Protocol (BSC)"
    },
    {
      id: "intercroneswap-bsc",
      name: "InterCroneSwap (BSC)"
    },
    {
      id: "sushiswap-v3-bsc",
      name: "Sushiswap V3 (BSC)"
    },
    {
      id: "magicfox",
      name: "Magicfox"
    },
    {
      id: "veplus",
      name: "Veplus"
    },
    {
      id: "biswap-v3",
      name: "Biswap V3 (Legacy)"
    },
    {
      id: "acsi-finance",
      name: "Acsi Finance"
    },
    {
      id: "usdfi",
      name: "USDFI"
    },
    {
      id: "smardex-bsc",
      name: "SmarDex (BSC)"
    },
    {
      id: "ampleswap-bsc",
      name: "AmpleSwap (BSC)"
    },
    {
      id: "dex-on-crypto",
      name: "Dex on Crypto"
    },
    {
      id: "allinxswap-bsc",
      name: "AllInXSwap (BSC)"
    },
    {
      id: "diamondswap-bsc",
      name: "DiamondSwap (BSC)"
    },
    {
      id: "creamswap",
      name: "CreamSwap"
    },
    {
      id: "biswap-v3-1",
      name: "Biswap V3"
    },
    {
      id: "melegaswap",
      name: "MelegaSwap"
    },
    {
      id: "degendex-bsc",
      name: "DegenDex (BSC)"
    },
    {
      id: "donaswap-v3-bsc",
      name: "Donaswap V3 (BSC)"
    },
    {
      id: "woken-exchange-bsc",
      name: "Woken Exchange (BSC)"
    },
    {
      id: "lif3-v3-bsc",
      name: "Lif3 V3 (BSC)"
    },
    {
      id: "lovely-swap",
      name: "Lovely Swap"
    },
    {
      id: "orion-bsc",
      name: "Orion (BSC)"
    },
    {
      id: "uniswap-v2-bsc",
      name: "Uniswap V2 (BSC)"
    },
    {
      id: "pancakeswap-v1-bsc",
      name: "Pancakeswap V1 (BSC)"
    }
    ]
  },

  { name: 'Polygon POS', 
    id: 'polygon_pos',
    dexs: [
    {
      id: "quickswap",
      name: "Quickswap"
    },
    {
      id: "sushiswap_polygon_pos",
      name: "Sushiswap (Polygon POS)"
    },
    {
      id: "apeswap_polygon",
      name: "ApeSwap (Polygon)"
    },
    {
      id: "dinoswap",
      name: "Dinoswap"
    },
    {
      id: "firebird_finance_polygon",
      name: "Firebird Finance (Polygon)"
    },
    {
      id: "comethswap",
      name: "ComethSwap"
    },
    {
      id: "dfyn",
      name: "Dfyn"
    },
    {
      id: "elk_finance_polygon",
      name: "Elk Finance (Polygon)"
    },
    {
      id: "wault_finance_polygon",
      name: "Wault Finance (Polygon)"
    },
    {
      id: "jetswap_polygon",
      name: "Jetswap (Polygon)"
    },
    {
      id: "polydex",
      name: "PolyDEX"
    },
    {
      id: "gravity_finance",
      name: "Gravity Finance"
    },
    {
      id: "polycat_finance",
      name: "Polycat Finance"
    },
    {
      id: "algebra_finance",
      name: "Algebra Finance"
    },
    {
      id: "tetuswap",
      name: "TetuSwap"
    },
    {
      id: "uniswap_v3_polygon_pos",
      name: "Uniswap V3 (Polygon POS)"
    },
    {
      id: "nachoswap",
      name: "NachoSwap"
    },
    {
      id: "greenhouse_dex",
      name: "Greenhouse DEX"
    },
    {
      id: "justmoney_polygon_pos",
      name: "JustMoney (Polygon POS)"
    },
    {
      id: "radioshack_polygon_pos",
      name: "RadioShack (Polygon POS)"
    },
    {
      id: "dystopia",
      name: "Dystopia"
    },
    {
      id: "vulcandex",
      name: "VulcanDex"
    },
    {
      id: "kyberswap_classic_polygon",
      name: "Kyberswap Classic (Polygon)"
    },
    {
      id: "auraswap",
      name: "AuraSwap"
    },
    {
      id: "fraxswap_polygon_pos",
      name: "Fraxswap (Polygon POS)"
    },
    {
      id: "curve_polygon_pos",
      name: "Curve (Polygon POS)"
    },
    {
      id: "honeyswap_polygon",
      name: "Honeyswap (Polygon)"
    },
    {
      id: "meshswap",
      name: "MeshSwap"
    },
    {
      id: "mm-finance-polygon",
      name: "MM Finance (Polygon)"
    },
    {
      id: "spice_trade_polygon",
      name: "Spice Trade (Polygon)"
    },
    {
      id: "kyberswap_elastic_polygon",
      name: "Kyberswap Elastic (Polygon)"
    },
    {
      id: "quickswap_v3",
      name: "Quickswap (v3)"
    },
    {
      id: "balancer_polygon",
      name: "Balancer V2 (Polygon)"
    },
    {
      id: "lif3-polygon",
      name: "lif3 (Polygon)"
    },
    {
      id: "crowdswap-polygon",
      name: "CrowdSwap (Polygon)"
    },
    {
      id: "satin-exchange",
      name: "Satin Exchange"
    },
    {
      id: "phenix-finance-polygon",
      name: "Phenix Finance (Polygon)"
    },
    {
      id: "safemoonswap-polygon",
      name: "SafemoonSwap (Polygon)"
    },
    {
      id: "purplebridge",
      name: "PurpleBridge"
    },
    {
      id: "sushiswap-v3-polygon",
      name: "Sushiswap V3 (Polygon)"
    },
    {
      id: "pearl-exchange",
      name: "PearlFi V1"
    },
    {
      id: "retro",
      name: "Retro"
    },
    {
      id: "pearlfi-v1-5",
      name: "PearlFi V1.5"
    },
    {
      id: "smardex-polygon",
      name: "SmarDex (Polygon)"
    },
    {
      id: "archly-polygon",
      name: "Archly (Polygon)"
    },
    {
      id: "dex-on-crypto-polygon",
      name: "Dex on Crypto (Polygon)"
    },
    {
      id: "mama-defi",
      name: "MAMA DeFi"
    },
    {
      id: "ix-swap",
      name: "IX Swap"
    },
    {
      id: "lif3-v3-polygon",
      name: "Lif3 V3 (Polygon)"
    },
    {
      id: "dooar-polygon",
      name: "DOOAR (Polygon)"
    },
    {
      id: "orion-polygon",
      name: "Orion (Polygon)"
    },
    {
      id: "uniswap-v2-polygon",
      name: "Uniswap V2 (Polygon)"
    },
    {
      id: "squadswap-v2-polygon",
      name: "SquadSwap V2 (Polygon)"
    },
    {
      id: "squadswap-v3-polygon",
      name: "Squadswap V3 (Polygon)"
    },
    {
      id: "uniswap-v4-polygon",
      name: "Uniswap V4 (Polygon)"
    },
    {
      id: "gt3",
      name: "GT3"
    },
    {
      id: "w-dex-polygon",
      name: "W-DEX (Polygon)"
    }
    ]
  },

  { name: 'Avalanche', 
    id: 'avax',
    dexs: [
    {
      id: "pangolin",
      name: "Pangolin"
    },
    {
      id: "traderjoe",
      name: "LFJ"
    },
    {
      id: "lydia_finance",
      name: "Lydia Finance"
    },
    {
      id: "thorus",
      name: "Thorus"
    },
    {
      id: "firebird_avax",
      name: "Firebird (Avalanche)"
    },
    {
      id: "elk_finance_avax",
      name: "Elk Finance (Avalanche)"
    },
    {
      id: "yetiswap",
      name: "YetiSwap"
    },
    {
      id: "sushiswap_avalanche",
      name: "Sushiswap (Avalanche)"
    },
    {
      id: "hakuswap",
      name: "HakuSwap"
    },
    {
      id: "radioshack_avalanche",
      name: "RadioShack (Avalanche)"
    },
    {
      id: "hurricaneswap",
      name: "HurricaneSwap"
    },
    {
      id: "apexswap",
      name: "Apexswap"
    },
    {
      id: "swapsicle",
      name: "Swapsicle"
    },
    {
      id: "fraxswap_avalanche",
      name: "Fraxswap (Avalanche)"
    },
    {
      id: "spice_trade_avalanche",
      name: "Spice Trade (Avalanche)"
    },
    {
      id: "kyberswap_elastic_avalanche",
      name: "Kyberswap Elastic (Avalanche)"
    },
    {
      id: "baguette",
      name: "Baguette"
    },
    {
      id: "soulswap_avalanche",
      name: "Soulswap (Avalanche)"
    },
    {
      id: "kyberswap_classic_avalanche",
      name: "Kyberswap Classic (Avalanche)"
    },
    {
      id: "traderjoe-v2-avalanche",
      name: "LFJ V2 (Avalanche)"
    },
    {
      id: "onavax",
      name: "onAVAX"
    },
    {
      id: "curve_avalanche",
      name: "Curve (Avalanche)"
    },
    {
      id: "vapordex",
      name: "VaporDex"
    },
    {
      id: "hunnyswap",
      name: "HunnySwap"
    },
    {
      id: "flair-dex",
      name: "Flair Dex"
    },
    {
      id: "glacier",
      name: "Glacier V2"
    },
    {
      id: "solisnek",
      name: "SoliSnek"
    },
    {
      id: "traderjoe-v2-1-avalanche",
      name: "LFJ V2.1 (Avalanche)"
    },
    {
      id: "sushiswap-v3-avalanche",
      name: "Sushiswap V3 (Avalanche)"
    },
    {
      id: "uniswap-v3-avalanche",
      name: "Uniswap V3 (Avalanche)"
    },
    {
      id: "balancer-v2-avalanche",
      name: "Balancer V2 (Avalanche)"
    },
    {
      id: "dex-on-crypto-avalanche",
      name: "Dex on Crypto (Avalanche)"
    },
    {
      id: "canary-exchange",
      name: "Canary Exchange"
    },
    {
      id: "pharaoh-exchange",
      name: "Pharaoh Exchange"
    },
    {
      id: "vapordex-v2",
      name: "VaporDEX V2"
    },
    {
      id: "antfarm-avalanche",
      name: "Antfarm (Avalanche)"
    },
    {
      id: "archly-avalanche",
      name: "Archly (Avalanche)"
    },
    {
      id: "uniswap-v2-avalanche",
      name: "Uniswap V2 (Avalanche)"
    },
    {
      id: "pharaoh-exchange-v1",
      name: "Pharaoh Exchange V1"
    },
    {
      id: "pyreswap-avalanche",
      name: "PyreSwap (Avalanche)"
    },
    {
      id: "traderjoe-v2-2-avalanche",
      name: "LFJ V2.2 (Avalanche)"
    },
    {
      id: "fwx",
      name: "FWX"
    },
    {
      id: "uniswap-v4-avalanche",
      name: "Uniswap V4 (Avalanche)"
    },
    {
      id: "aquaspace",
      name: "AquaSpace"
    },
    {
      id: "arena-dex",
      name: "Arena DEX"
    },
    {
      id: "pangolin-v3",
      name: "Pangolin V3"
    },
    {
      id: "blackhole-v2",
      name: "Blackhole V2"
    },
    {
      id: "blackhole-v3",
      name: "Blackhole V3"
    }
    ]
  },

  { name: 'Base', 
    id: 'base',
    dexs: [
    {
      id: "leetswap-base",
      name: "Leetswap (Base)"
    },
    {
      id: "rocketswap",
      name: "Rocketswap"
    },
    {
      id: "cbswap",
      name: "CBSwap"
    },
    {
      id: "ensurer",
      name: "Ensurer"
    },
    {
      id: "oasisswap-base",
      name: "OasisSwap (Base)"
    },
    {
      id: "sushiswap-v3-base",
      name: "Sushiswap V3 (Base)"
    },
    {
      id: "synthswap",
      name: "Synthswap"
    },
    {
      id: "swapbased",
      name: "SwapBased"
    },
    {
      id: "horizondex-base",
      name: "HorizonDEX (Base)"
    },
    {
      id: "baseswap",
      name: "BaseSwap"
    },
    {
      id: "velocimeter-base",
      name: "Velocimeter (Base)"
    },
    {
      id: "kokonutswap-base",
      name: "KokonutSwap (Base)"
    },
    {
      id: "lfgswap-base",
      name: "LFGSwap (Base)"
    },
    {
      id: "crescentswap-base",
      name: "CrescentSwap (Base)"
    },
    {
      id: "swapline-base",
      name: "Swapline (Base)"
    },
    {
      id: "balancer-v2-base",
      name: "Balancer V2 (Base)"
    },
    {
      id: "sobal-base",
      name: "Sobal (Base)"
    },
    {
      id: "dackieswap-v3-base",
      name: "DackieSwap V3 (Base)"
    },
    {
      id: "uniswap-v3-base",
      name: "Uniswap V3 (Base)"
    },
    {
      id: "degenbrains-base",
      name: "DegenBrains (Base)"
    },
    {
      id: "cloudbase",
      name: "CloudBase"
    },
    {
      id: "yum-yum-swap",
      name: "Yum Yum Swap"
    },
    {
      id: "throne-v3-base",
      name: "Throne V3 (Base)"
    },
    {
      id: "alien-base",
      name: "Alien Base"
    },
    {
      id: "baso-finance",
      name: "Baso Finance"
    },
    {
      id: "icecreamswap-base",
      name: "Icecreamswap (Base)"
    },
    {
      id: "bakeryswap-base",
      name: "BakerySwap (Base)"
    },
    {
      id: "throne-v2-base",
      name: "Throne V2 (Base)"
    },
    {
      id: "archly-base",
      name: "Archly (Base)"
    },
    {
      id: "soswap",
      name: "Soswap"
    },
    {
      id: "derpdex-base",
      name: "DerpDEX (Base)"
    },
    {
      id: "pixelswap-base",
      name: "PixelSwap (Base)"
    },
    {
      id: "diamondswap",
      name: "DiamondSwap"
    },
    {
      id: "pancakeswap-v3-base",
      name: "Pancakeswap V3 (Base)"
    },
    {
      id: "pancakeswap-v2-base",
      name: "Pancakeswap V2 (Base)"
    },
    {
      id: "aerodrome-base",
      name: "Aerodrome (Base)"
    },
    {
      id: "smardex-base",
      name: "SmarDex (Base)"
    },
    {
      id: "kyberswap-elastic-base",
      name: "Kyberswap Elastic (Base)"
    },
    {
      id: "dackieswap-v2-base",
      name: "DackieSwap V2 (Base)"
    },
    {
      id: "plantbaseswap",
      name: "PlantBaseSwap"
    },
    {
      id: "moonbase",
      name: "MoonBase"
    },
    {
      id: "equalizer-base",
      name: "Equalizer (Base)"
    },
    {
      id: "dex-on-crypto-base",
      name: "Dex on Crypto (Base)"
    },
    {
      id: "iziswap-base",
      name: "iZiSwap (Base)"
    },
    {
      id: "area-51-alien-base",
      name: "Area 51 (Alien Base)"
    },
    {
      id: "sushiswap-v2-base",
      name: "SushiSwap V2 (Base)"
    },
    {
      id: "sharkswap-base",
      name: "SharkSwap (Base)"
    },
    {
      id: "torus",
      name: "Torus"
    },
    {
      id: "citadelswap",
      name: "CitadelSwap"
    },
    {
      id: "satori-base",
      name: "Satori (Base)"
    },
    {
      id: "uniswap-v2-base",
      name: "Uniswap V2 (Base)"
    },
    {
      id: "solidly-v3-base",
      name: "Solidly V3 (Base)"
    },
    {
      id: "infusion",
      name: "Infusion"
    },
    {
      id: "candyswap",
      name: "CandySwap"
    },
    {
      id: "basex",
      name: "BaseX"
    },
    {
      id: "robots-farm-base",
      name: "Robots.Farm (Base)"
    },
    {
      id: "bunnyswap",
      name: "BunnySwap"
    },
    {
      id: "aerodrome-slipstream",
      name: "Aerodrome SlipStream"
    },
    {
      id: "memebox-base",
      name: "Memebox (Base)"
    },
    {
      id: "swapbased-v3",
      name: "SwapBased V3"
    },
    {
      id: "baseswap-v3",
      name: "BaseSwap V3"
    },
    {
      id: "curve-base",
      name: "Curve (Base)"
    },
    {
      id: "bluedex",
      name: "Bluedex"
    },
    {
      id: "synthswap-v3",
      name: "Synthswap V3"
    },
    {
      id: "marswap-base",
      name: "MarSwap (Base)"
    },
    {
      id: "dejungle",
      name: "deJungle"
    },
    {
      id: "ethervista-base",
      name: "EtherVista (Base)"
    },
    {
      id: "alien-base-v3",
      name: "Alien Base V3"
    },
    {
      id: "squadswap-base",
      name: "SquadSwap (Base)"
    },
    {
      id: "squadswap-v3-base",
      name: "SquadSwap V3 (Base)"
    },
    {
      id: "x7-finance-base",
      name: "Xchange (Base)"
    },
    {
      id: "fwx-base",
      name: "FWX (Base)"
    },
    {
      id: "kim-v4-base",
      name: "Kim V4 (Base)"
    },
    {
      id: "kim-v2-base",
      name: "Kim V2 (Base)"
    },
    {
      id: "henjin",
      name: "HenjinDEX (Base)"
    },
    {
      id: "uniswap-v4-base",
      name: "Uniswap V4 (Base)"
    },
    {
      id: "treble-v2",
      name: "Treble V2"
    },
    {
      id: "maverick-v2-base",
      name: "Maverick V2 (Base)"
    },
    {
      id: "virtuals-base",
      name: "Virtuals (Base)"
    },
    {
      id: "9mm-v3-base",
      name: "9mm V3 (Base)"
    },
    {
      id: "9mm-v2-base",
      name: "9mm V2 (Base)"
    },
    {
      id: "deltaswap-base",
      name: "Deltaswap (Base)"
    },
    {
      id: "treble-v4",
      name: "Treble V4"
    },
    {
      id: "rubicon-base",
      name: "Rubicon (Base)"
    },
    {
      id: "hydrex-integral",
      name: "Hydrex Integral"
    },
    {
      id: "kewlswap-base",
      name: "KEWLSwap (Base)"
    },
    {
      id: "quickswap-v2-base",
      name: "Quickswap V2 (Base)"
    },
    {
      id: "quickswap-v4-base",
      name: "Quickswap V4 (Base)"
    }
    ]
  },

  { name: 'Solana', 
    id: 'solana',
    dexs: [
    {
      id: "raydium",
      name: "Raydium"
    },
    {
      id: "orca",
      name: "Orca"
    },
    {
      id: "raydium-clmm",
      name: "Raydium (CLMM)"
    },
    {
      id: "fluxbeam",
      name: "FluxBeam"
    },
    {
      id: "meteora",
      name: "Meteora"
    },
    {
      id: "dexlab",
      name: "Dexlab"
    },
    {
      id: "daos-fun",
      name: "Daos.fun"
    },
    {
      id: "pumpswap",
      name: "PumpSwap"
    },
    {
      id: "virtuals-solana",
      name: "Virtuals (Solana)"
    },
    {
      id: "boop-fun",
      name: "Boop.fun"
    },
    {
      id: "saros-amm",
      name: "Saros AMM"
    },
    {
      id: "meteora-dbc",
      name: "Meteora DBC"
    },
    {
      id: "byreal",
      name: "Byreal"
    },
    {
      id: "pancakeswap-v3-solana",
      name: "Pancakeswap V3 (Solana)"
    },
    {
      id: "meteora-damm-v2",
      name: "Meteora DAMM V2"
    },
    {
      id: "raydium-launchlab",
      name: "Raydium Launchlab"
    },
    {
      id: "pump-fun",
      name: "Pump.fun"
    },
    {
      id: "saros-dlmm",
      name: "Saros DLMM"
    }
    ]
  },

  { name: 'Arbitrum', 
    id: 'arbitrum',
    dexs: [
    {
      id: "sushiswap_arbitrum",
      name: "SushiSwap (Arbitrum)"
    },
    {
      id: "uniswap_v3_arbitrum",
      name: "Uniswap V3 (Arbitrum)"
    },
    {
      id: "swapr_arbitrum",
      name: "Swapr (Arbitrum)"
    },
    {
      id: "fraxswap_arbitrum",
      name: "Fraxswap (Arbitrum)"
    },
    {
      id: "curve_arbitrum",
      name: "Curve (Arbitrum)"
    },
    {
      id: "kyberswap_elastic_arbitrum",
      name: "Kyberswap Elastic (Arbitrum)"
    },
    {
      id: "kyberswap_classic_arbitrum",
      name: "Kyberswap Classic (Arbitrum)"
    },
    {
      id: "elk_finance_arbitrum",
      name: "Elk Finance (Arbitrum)"
    },
    {
      id: "camelot",
      name: "Camelot"
    },
    {
      id: "3xcalibur",
      name: "3xcalibur"
    },
    {
      id: "swapfish",
      name: "SwapFish"
    },
    {
      id: "arbswap_arbitrum_one",
      name: "Arbswap (Arbitrum One)"
    },
    {
      id: "oreoswap",
      name: "OreoSwap"
    },
    {
      id: "balancer_arbitrum",
      name: "Balancer V2 (Arbitrum)"
    },
    {
      id: "traderjoe-v2-arbitrum",
      name: "LFJ V2 (Arbitrum)"
    },
    {
      id: "magicswap",
      name: "Magicswap"
    },
    {
      id: "zyberswap",
      name: "Zyberswap"
    },
    {
      id: "solidlizard",
      name: "SolidLizard"
    },
    {
      id: "sharkyswap",
      name: "SharkySwap"
    },
    {
      id: "alienfi",
      name: "AlienFi"
    },
    {
      id: "arbiswap",
      name: "ArbiSwap"
    },
    {
      id: "sterling",
      name: "Sterling"
    },
    {
      id: "oasisswap",
      name: "OasisSwap"
    },
    {
      id: "mindgames-arbitrum",
      name: "Mindgames (Arbitrum)"
    },
    {
      id: "archly-arbitrum",
      name: "Archly (Arbitrum)"
    },
    {
      id: "arbidex",
      name: "Arbidex"
    },
    {
      id: "apeswap-arbitrum",
      name: "Apeswap (Arbitrum)"
    },
    {
      id: "mm-finance-arbitrum",
      name: "MM Finance (Arbitrum)"
    },
    {
      id: "ramses",
      name: "Ramses"
    },
    {
      id: "auragi",
      name: "Auragi"
    },
    {
      id: "aegis",
      name: "Aegis"
    },
    {
      id: "mm-finance-v3-arbitrum",
      name: "MM Finance V3 (Arbitrum)"
    },
    {
      id: "camelot-v3",
      name: "Camelot V3"
    },
    {
      id: "traderjoe-v2-1-arbitrum",
      name: "LFJ V2.1 (Arbitrum)"
    },
    {
      id: "arbswap-stableswap-arbitrum",
      name: "Arbswap StableSwap (Arbitrum)"
    },
    {
      id: "whitehole-arbitrum",
      name: "Whitehole (Arbitrum)"
    },
    {
      id: "chronos",
      name: "Chronos"
    },
    {
      id: "lfgswap-arbitrum",
      name: "LFGswap (Arbitrum)"
    },
    {
      id: "swaprum",
      name: "Swaprum"
    },
    {
      id: "solunea-arbitrum",
      name: "Solunea (Arbitrum)"
    },
    {
      id: "arbidex-v3",
      name: "Arbidex V3"
    },
    {
      id: "crescentswap",
      name: "CrescentSwap"
    },
    {
      id: "ramses-v2",
      name: "Ramses V2"
    },
    {
      id: "sushiswap-v3-arbitrum",
      name: "Sushiswap V3 (Arbitrum)"
    },
    {
      id: "dexswap",
      name: "dexSWAP"
    },
    {
      id: "forge-sx",
      name: "Forge Sx"
    },
    {
      id: "degenbrains",
      name: "Degenbrains"
    },
    {
      id: "spartadex",
      name: "SpartaDEX"
    },
    {
      id: "pancakeswap-v2-arbitrum",
      name: "Pancakeswap V2 (Arbitrum)"
    },
    {
      id: "pancakeswap-v3-arbitrum",
      name: "Pancakeswap V3 (Arbitrum)"
    },
    {
      id: "smardex-arbitrum",
      name: "SmarDex (Arbitrum)"
    },
    {
      id: "darwinswap",
      name: "DarwinSwap"
    },
    {
      id: "pixelswap-arbitrum",
      name: "PixelSwap (Arbitrum)"
    },
    {
      id: "antfarm-arbitrum",
      name: "Antfarm (Arbitrum)"
    },
    {
      id: "dex-on-crypto-arbitrum",
      name: "Dex on Crypto (Arbitrum)"
    },
    {
      id: "shekelswap",
      name: "ShekelSwap"
    },
    {
      id: "spinaqdex",
      name: "SpinaqDex"
    },
    {
      id: "woken-exchange-arbitrum",
      name: "Woken Exchange (Arbitrum)"
    },
    {
      id: "kaleidoswap-arbitrum",
      name: "KaleidoSwap (Arbitrum)"
    },
    {
      id: "gasx",
      name: "GasX"
    },
    {
      id: "uniswap-v2-arbitrum",
      name: "Uniswap V2 (Arbitrum)"
    },
    {
      id: "dackieswap-v2-arbitrum",
      name: "DackieSwap V2 (Arbitrum)"
    },
    {
      id: "dackieswap-v3-arbitrum",
      name: "DackieSwap V3 (Arbitrum)"
    },
    {
      id: "pancakeswap-stableswap-arbitrum",
      name: "Pancakeswap Stableswap (Arbitrum)"
    },
    {
      id: "solidly-v3-arbitrum",
      name: "Solidly V3 (Arbitrum)"
    },
    {
      id: "kewlswap-arbitrum",
      name: "KEWLSwap (Arbitrum)"
    },
    {
      id: "traderjoe-v2-2-arbitrum",
      name: "LFJ V2.2 (Arbitrum)"
    },
    {
      id: "moonbase-alpha",
      name: "Moonbase Alpha"
    },
    {
      id: "deltaswap",
      name: "Deltaswap (Arbitrum)"
    },
    {
      id: "ethervista-arbitrum",
      name: "EtherVista (Arbitrum)"
    },
    {
      id: "squadswap-v2-arbitrum",
      name: "SquadSwap V2 (Arbitrum)"
    },
    {
      id: "squadswap-v3-arbitrum",
      name: "SquadSwap V3 (Arbitrum)"
    },
    {
      id: "uniswap-v4-arbitrum",
      name: "Uniswap V4 (Arbitrum)"
    },
    {
      id: "maverick-v2-arbitrum",
      name: "Maverick V2 (Arbitrum)"
    }
    ]
  },

  { name: 'Sui NetworK', 
    id: 'sui-network',
    dexs: [
    {
      id: "bluemove",
      name: "BlueMove"
    },
    {
      id: "cetus",
      name: "Cetus"
    },
    {
      id: "flameswap",
      name: "FlameSwap"
    },
    {
      id: "suiswap",
      name: "Suiswap"
    },
    {
      id: "kriya-dex",
      name: "KriyaDEX"
    },
    {
      id: "turbos-finance",
      name: "Turbos Finance"
    },
    {
      id: "bluefin",
      name: "Bluefin"
    },
    {
      id: "flow-x",
      name: "FlowX"
    },
    {
      id: "magma-finance",
      name: "Magma Finance"
    },
    {
      id: "flowx-clmm",
      name: "FlowX CLMM"
    }
    ]
  },

  { name: 'Tron', 
    id: 'tron',
    dexs: [
      {
        id: "sunswap-v2",
        name: "Sunswap V2"
      },
      {
        id: "sunswap-v3",
        name: "Sunswap V3"
      },
      {
        id: "justmoney-tron",
        name: "JustMoney (Tron)"
      },
      {
        id: "sushiswap-v2-tron",
        name: "SushiSwap V2 (Tron)"
      }
    ]
  },

  { name: 'Unichain', 
    id: 'unichain',
    dexs: [
      {
        id: "uniswap-v2-unichain",
        name: "Uniswap V2 (Unichain)"
      },
      {
        id: "uniswap-v3-unichain",
        name: "Uniswap V3 (Unichain)" 
      },
      {
        id: "uniswap-v4-unichain",
        name: "Uniswap V4 (Unichain)"
      },
      {
        id: "velodrome-finance-slipstream-unichain",
        name: "Velodrome Finance Slipstream (Unichain)"
      },
      {
        id: "velodrome-finance-v2-unichain",
        name: "Velodrome Finance V2 (Unichain)"
      }
    ]
  },
]

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// CHECKPOINT FUNCTIONS
// ============================================================================

/**
 * Save checkpoint of current progress
 */
const saveCheckpoint = async (processedTokens, tokenLookup, uniqueTokens) => {
  const checkpoint = {
    processedTokens,
    fetchedTokens: Object.fromEntries(tokenLookup),
    timestamp: new Date().toISOString(),
    totalTokens: uniqueTokens.size
  };
  
  await fs.writeFile('token_fetch_checkpoint.json', JSON.stringify(checkpoint, null, 2));
  console.log(`💾 Checkpoint saved: ${processedTokens}/${uniqueTokens.size} tokens processed`);
};

/**
 * Load checkpoint if it exists
 */
const loadCheckpoint = async () => {
  try {
    const fileContent = await fs.readFile('token_fetch_checkpoint.json', 'utf8');
    const checkpoint = JSON.parse(fileContent);
    console.log(`📂 Checkpoint found: ${checkpoint.processedTokens}/${checkpoint.totalTokens} tokens already processed`);
    console.log(`📅 Last checkpoint: ${checkpoint.timestamp}`);
    return checkpoint;
  } catch (error) {
    console.log('📂 No checkpoint found, starting fresh');
    return null;
  }
};

/**
 * Clean up checkpoint file after successful completion
 */
const cleanupCheckpoint = async () => {
  try {
    await fs.unlink('token_fetch_checkpoint.json');
    console.log('🧹 Checkpoint file cleaned up');
  } catch (error) {
    // File doesn't exist, which is fine
  }
};

// ============================================================================
// CORE ENRICHMENT FUNCTIONS
// ============================================================================

/**
 * Load pool data from JSON files and add to chains structure
 */
const loadPoolDataIntoChains = async (chains) => {
  console.log('Loading pool data from JSON files...');
  
  for (const chain of chains) {
    const chainDir = chain.name.replace(/\s+/g, '_') + '_Dex_Pairs';
    
    try {
      await fs.access(chainDir);
    } catch (error) {
      console.log(`Directory ${chainDir} not found, skipping...`);
      continue;
    }
    
    console.log(`Processing chain: ${chain.name}`);
    
    for (const dex of chain.dexs) {
      const filename = `${chainDir}/${dex.name.replace(/\s+/g, '_')}.json`;
      
      try {
        const fileContent = await fs.readFile(filename, 'utf8');
        const poolData = JSON.parse(fileContent);
        dex.pools = poolData;
        console.log(`  Loaded ${poolData.length} pools for ${dex.name}`);
      } catch (error) {
        console.log(`  Could not load ${filename}: ${error.message}`);
        dex.pools = [];
      }
    }
  }
  
  console.log('Pool data loading complete!');
  return chains;
};

/**
 * Extract all unique token addresses from all chains/dexes/pools
 */
const extractUniqueTokens = (chains) => {
  console.log('Extracting unique token addresses...');
  
  const uniqueTokens = new Map();
  
  for (const chain of chains) {
    for (const dex of chain.dexs) {
      if (!dex.pools) continue;
      
      for (const pool of dex.pools) {
        // Extract base token
        if (pool.relationships?.base_token?.id) {
          const fullId = pool.relationships.base_token.id;
          const address = fullId.split('_')[1];
          
          if (address && address !== '0x0000000000000000000000000000000000000000') {
            uniqueTokens.set(address, { chainId: chain.id, fullId: fullId });
          }
        }
        
        // Extract quote token
        if (pool.relationships?.quote_token?.id) {
          const fullId = pool.relationships.quote_token.id;
          const address = fullId.split('_')[1];
          
          if (address && address !== '0x0000000000000000000000000000000000000000') {
            uniqueTokens.set(address, { chainId: chain.id, fullId: fullId });
          }
        }
      }
    }
  }
  
  console.log(`Found ${uniqueTokens.size} unique token addresses`);
  return uniqueTokens;
};

/**
 * Enhanced token fetching with throttle resistance and checkpointing
 */
const fetchTokenDataWithCheckpoints = async (uniqueTokens) => {
  console.log('🚀 Starting throttle-resistant token fetching...');
  
  const checkpoint = await loadCheckpoint();
  
  let tokenLookup = new Map();
  let processedTokens = 0;
  let tokensArray = Array.from(uniqueTokens.entries());
  
  // Resume from checkpoint if available
  if (checkpoint) {
    console.log('🔄 Resuming from checkpoint...');
    
    for (const [tokenId, tokenData] of Object.entries(checkpoint.fetchedTokens)) {
      tokenLookup.set(tokenId, tokenData);
    }
    
    processedTokens = checkpoint.processedTokens;
    console.log(`✅ Loaded ${tokenLookup.size} previously fetched tokens`);
    console.log(`🎯 Resuming from token ${processedTokens + 1}/${uniqueTokens.size}`);
  }
  
  const options = {
    method: 'GET',
    headers: {accept: 'application/json', 'x-cg-demo-api-key': 'CG-dgAPa1NhXtTyw8f9YJ1Fx25w'}
  };
  
  const total = uniqueTokens.size;
  const maxRetries = 3;
  const throttleWaitTime = 60000; // 1 minute wait when throttled
  
  // Process remaining tokens
  for (let i = processedTokens; i < total; i++) {
    const [address, tokenInfo] = tokensArray[i];
    let retryCount = 0;
    let success = false;
    
    while (!success && retryCount < maxRetries) {
      try {
        const url = `https://api.coingecko.com/api/v3/onchain/networks/${tokenInfo.chainId}/tokens/multi/${address}`;
        
        console.log(`🔍 [${i + 1}/${total}] Fetching ${address.slice(0, 8)}... (attempt ${retryCount + 1})`);
        
        const response = await fetch(url, options);
        const responseText = await response.text();
        
        // Check for throttling
        if (responseText.includes('Throttled') || responseText.includes('Rate limit') || response.status === 429) {
          console.log(`⏳ Throttled! Waiting ${throttleWaitTime / 1000} seconds before retry...`);
          console.log(`📊 Progress so far: ${i}/${total} tokens (${Math.round((i / total) * 100)}%)`);
          
          await saveCheckpoint(i, tokenLookup, uniqueTokens);
          await sleep(throttleWaitTime);
          retryCount++;
          continue;
        }
        
        if (response.status !== 200) {
          console.log(`❌ HTTP ${response.status} for ${address.slice(0, 8)}...`);
          if (retryCount < maxRetries - 1) {
            await sleep(2000);
            retryCount++;
            continue;
          } else {
            success = true;
            continue;
          }
        }
        
        const json = JSON.parse(responseText);
        
        if (json.data && json.data.length > 0) {
          tokenLookup.set(tokenInfo.fullId, json.data[0]);
          console.log(`  ✅ ${json.data[0].attributes.symbol} (${address.slice(0, 8)}...)`);
        } else {
          console.log(`  ❌ No data found for ${address.slice(0, 8)}...`);
        }
        
        success = true;
        
        // Save checkpoint every 25 tokens
        if ((i + 1) % 25 === 0) {
          await saveCheckpoint(i + 1, tokenLookup, uniqueTokens);
        }
        
        // Progress update every 50 tokens
        if ((i + 1) % 50 === 0) {
          const percent = Math.round(((i + 1) / total) * 100);
          console.log(`📈 Progress: ${i + 1}/${total} tokens (${percent}%) - ${tokenLookup.size} successful fetches`);
        }
        
        // Normal rate limiting (except for last token)
        if (i < total - 1) {
          await sleep(1000);
        }
        
      } catch (error) {
        console.error(`💥 Error fetching ${address.slice(0, 8)}...: ${error.message}`);
        
        if (error.message.includes('Throttled') || error.message.includes('JSON')) {
          console.log(`⏳ Detected throttling error, waiting ${throttleWaitTime / 1000} seconds...`);
          await saveCheckpoint(i, tokenLookup, uniqueTokens);
          await sleep(throttleWaitTime);
          retryCount++;
        } else if (retryCount < maxRetries - 1) {
          console.log(`🔄 Retrying in 2 seconds... (${retryCount + 1}/${maxRetries})`);
          await sleep(2000);
          retryCount++;
        } else {
          console.log(`⚠️  Giving up on ${address.slice(0, 8)}... after ${maxRetries} attempts`);
          success = true;
        }
      }
    }
  }
  
  // Final checkpoint
  await saveCheckpoint(total, tokenLookup, uniqueTokens);
  
  console.log(`\n🎉 Token fetching complete!`);
  console.log(`✅ Successfully fetched: ${tokenLookup.size}/${total} tokens`);
  console.log(`⚠️  Failed/Skipped: ${total - tokenLookup.size} tokens`);
  
  return tokenLookup;
};

/**
 * Create the final enriched data structure with token lookup tables
 */
const createEnrichedDataStructure = (chains, tokenLookup) => {
  console.log('Creating enriched data structure with token lookup...');
  
  const tokenLookupObj = {};
  for (const [key, value] of tokenLookup) {
    tokenLookupObj[key] = value;
  }
  
  const enrichedData = {
    tokenLookup: tokenLookupObj,
    chains: chains,
    metadata: {
      totalTokens: tokenLookup.size,
      totalChains: chains.length,
      totalDexes: chains.reduce((sum, chain) => sum + chain.dexs.length, 0),
      totalPools: chains.reduce((sum, chain) => 
        sum + chain.dexs.reduce((dexSum, dex) => dexSum + (dex.pools?.length || 0), 0), 0
      ),
      createdAt: new Date().toISOString()
    }
  };
  
  console.log(`✓ Created enriched structure with ${enrichedData.metadata.totalTokens} unique tokens`);
  console.log(`✓ Total pools: ${enrichedData.metadata.totalPools}`);
  console.log(`✓ Memory efficient: No duplicate token data!`);
  
  return enrichedData;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Utility functions to work with the enriched data structure
 */
const createDataHelpers = (enrichedData) => {
  return {
    getToken: (tokenId) => enrichedData.tokenLookup[tokenId] || null,
    
    getEnrichedPool: (pool) => {
      const baseToken = pool.relationships?.base_token?.id 
        ? enrichedData.tokenLookup[pool.relationships.base_token.id] 
        : null;
      const quoteToken = pool.relationships?.quote_token?.id 
        ? enrichedData.tokenLookup[pool.relationships.quote_token.id] 
        : null;
        
      return {
        ...pool,
        enrichedTokens: { baseToken, quoteToken }
      };
    },
    
    getPoolsForToken: (tokenId) => {
      const pools = [];
      
      for (const chain of enrichedData.chains) {
        for (const dex of chain.dexs) {
          if (!dex.pools) continue;
          
          for (const pool of dex.pools) {
            const hasToken = 
              pool.relationships?.base_token?.id === tokenId ||
              pool.relationships?.quote_token?.id === tokenId;
              
            if (hasToken) {
              pools.push({
                chain: chain.name,
                chainId: chain.id,
                dex: dex.name,
                dexId: dex.id,
                pool: pool
              });
            }
          }
        }
      }
      
      return pools;
    },
    
    searchTokens: (query) => {
      const results = [];
      const lowerQuery = query.toLowerCase();
      
      for (const [tokenId, tokenData] of Object.entries(enrichedData.tokenLookup)) {
        const symbol = tokenData.attributes.symbol?.toLowerCase() || '';
        const name = tokenData.attributes.name?.toLowerCase() || '';
        
        if (symbol.includes(lowerQuery) || name.includes(lowerQuery)) {
          results.push({ tokenId, tokenData });
        }
      }
      
      return results;
    },
    
    getTokenStats: function(tokenId) {
      const token = enrichedData.tokenLookup[tokenId];
      if (!token) return null;
      
      const pools = this.getPoolsForToken(tokenId);
      const chains = [...new Set(pools.map(p => p.chainId))];
      const dexes = [...new Set(pools.map(p => p.dexId))];
      
      return {
        token: token.attributes,
        totalPools: pools.length,
        chainsCount: chains.length,
        dexesCount: dexes.length,
        chains,
        dexes,
        totalLiquidity: pools.reduce((sum, p) => 
          sum + parseFloat(p.pool.attributes.reserve_in_usd || 0), 0
        )
      };
    }
  };
};

/**
 * Save the enriched data structure
 */
const saveEnrichedData = async (enrichedData, filename = 'enriched_dex_data.json') => {
  console.log(`Saving enriched data to ${filename}...`);
  
  try {
    await fs.writeFile(filename, JSON.stringify(enrichedData, null, 2));
    console.log(`✓ Enriched data saved to ${filename}`);
    
    // Save summary
    const summary = {
      metadata: enrichedData.metadata,
      chainSummary: enrichedData.chains.map(chain => ({
        name: chain.name,
        id: chain.id,
        dexCount: chain.dexs.length,
        totalPools: chain.dexs.reduce((sum, dex) => sum + (dex.pools?.length || 0), 0)
      })),
      topTokensByPools: Object.entries(enrichedData.tokenLookup)
        .map(([tokenId, tokenData]) => {
          const helpers = createDataHelpers(enrichedData);
          const pools = helpers.getPoolsForToken(tokenId);
          return {
            symbol: tokenData.attributes.symbol,
            name: tokenData.attributes.name,
            poolCount: pools.length,
            tokenId
          };
        })
        .sort((a, b) => b.poolCount - a.poolCount)
        .slice(0, 20)
    };
    
    await fs.writeFile('enriched_summary.json', JSON.stringify(summary, null, 2));
    console.log('✓ Summary saved to enriched_summary.json');
    
  } catch (error) {
    console.error(`Error saving data: ${error.message}`);
  }
};

/**
 * Load and return the enriched data with helper functions
 */
const loadEnrichedData = async (filename = 'enriched_dex_data.json') => {
  try {
    const fileContent = await fs.readFile(filename, 'utf8');
    const enrichedData = JSON.parse(fileContent);
    
    return {
      data: enrichedData,
      helpers: createDataHelpers(enrichedData)
    };
  } catch (error) {
    console.error(`Error loading enriched data: ${error.message}`);
    return null;
  }
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Enhanced main enrichment function with checkpoint support
 */
const enrichChainDataWithCheckpoints = async () => {
  console.log('🚀 Starting checkpoint-enabled enrichment process...\n');
  
  try {
    const chainsWithPools = await loadPoolDataIntoChains(chains);
    const uniqueTokens = extractUniqueTokens(chainsWithPools);
    const tokenLookup = await fetchTokenDataWithCheckpoints(uniqueTokens);
    const enrichedData = createEnrichedDataStructure(chainsWithPools, tokenLookup);
    await saveEnrichedData(enrichedData);
    await cleanupCheckpoint();
    
    console.log('\n🎉 Checkpoint-enabled enrichment completed successfully!');
    
    return { data: enrichedData, helpers: createDataHelpers(enrichedData) };
    
  } catch (error) {
    console.error('❌ Error during enrichment process:', error.message);
    console.log('💾 Progress saved in checkpoint file. Run again to resume from where you left off.');
    throw error;
  }
};

/**
 * Manual resume function for token fetching only
 */
const resumeTokenFetching = async () => {
  console.log('🔄 Manually resuming token fetching from checkpoint...\n');
  
  try {
    const chainsWithPools = await loadPoolDataIntoChains(chains);
    const uniqueTokens = extractUniqueTokens(chainsWithPools);
    const tokenLookup = await fetchTokenDataWithCheckpoints(uniqueTokens);
    
    console.log(`\n✅ Resumed fetching completed! Got ${tokenLookup.size} tokens total.`);
    return tokenLookup;
    
  } catch (error) {
    console.error('❌ Error during resume:', error.message);
    throw error;
  }
};

// ============================================================================
// EXECUTION
// ============================================================================

// Run the enhanced enrichment process with checkpoint support
await enrichChainDataWithCheckpoints();

// Alternative usage:
// await resumeTokenFetching(); // If you just want to resume token fetching
// const loaded = await loadEnrichedData(); // To load previously saved data
