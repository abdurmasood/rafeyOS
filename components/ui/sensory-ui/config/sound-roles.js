export const ALL_SOUND_ROLES = [
  "interaction.tap",
  "interaction.subtle",
  "interaction.toggle",
  "interaction.confirm",
  "overlay.open",
  "overlay.close",
  "overlay.expand",
  "overlay.collapse",
  "navigation.forward",
  "navigation.backward",
  "navigation.tab",
  "notification.info",
  "notification.success",
  "notification.warning",
  "notification.error",
  "hero.complete",
  "hero.milestone",
];

export function parseRole(role) {
  const [category, name] = role.split(".");
  return { category, name };
}
