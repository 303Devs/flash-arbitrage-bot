/**
 * BigInt JSON serialization fix
 * JSON.stringify throws on BigInt by default - this patch fixes it
 *
 * Import this file once at app startup (in main.ts) before any JSON.stringify calls
 */

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (): string {
  return this.toString();
};

export {};
