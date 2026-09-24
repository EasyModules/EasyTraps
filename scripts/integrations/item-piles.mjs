import { MODULE_ID } from "../core/constants.mjs";

export async function deleteItemPileDocument(tokenDocument) {
  if (!tokenDocument) return false;
  const api = game.modules.get("item-piles")?.active === true ? game.itempiles?.API : null;
  if (typeof api?.deleteItemPile === "function") {
    try {
      await api.deleteItemPile(tokenDocument);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Item Piles API deletion failed; falling back to Token deletion`, error);
    }
  }
  if (tokenDocument?.parent?.tokens?.has?.(tokenDocument.id)) {
    await tokenDocument.parent.deleteEmbeddedDocuments("Token", [tokenDocument.id], { easyTrapsInternal: true });
    return true;
  }
  return false;
}
