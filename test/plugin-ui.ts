// Stands in for the app's /_ohmygame/plugin-ui.js, which the app serves to plugin pages; tests mock connect().
export async function connect(): Promise<never> {
  throw new Error("The panel's tests give the page its bridge.");
}
