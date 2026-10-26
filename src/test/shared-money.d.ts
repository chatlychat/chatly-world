// Spec-only: `cards.parity.spec.ts` resolves the owner through a vitest alias, because
// `rootDir: src` keeps the private @livechat/shared source out of this program.
declare module '@livechat/shared/widget-blocks' {
  export function formatMoney(
    money: { readonly amount: number; readonly currency: string },
    locale?: string,
  ): string;
}
