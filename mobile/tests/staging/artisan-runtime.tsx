import { createElement } from "react";
import { Dimensions, Keyboard } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
const { createRoot } = require("react-dom/client");
import { supabase } from "../../lib/supabase";
import Home from "../../app/artisan";
import Workspace from "../../app/artisan-workspace/index";
import Opportunities from "../../app/artisan-workspace/opportunities";
import Opportunity from "../../app/artisan-workspace/opportunity/[id]";
import Missions from "../../app/artisan-workspace/missions";
import Mission from "../../app/mission/[id]";
import Evidence from "../../app/artisan-workspace/evidence/[id]";
import Agenda from "../../app/artisan-workspace/agenda";
import Clients from "../../app/artisan-workspace/clients";
import Client from "../../app/artisan-workspace/client/[id]";
import Quotes from "../../app/artisan-workspace/quotes";
import Quote from "../../app/artisan-workspace/quote/[id]";
import Finance from "../../app/artisan-workspace/finance";
import Profile from "../../app/artisan-workspace/profile";
import Notifications from "../../app/artisan-workspace/notifications";
import Rafi from "../../app/artisan-workspace/rafi";
import { usePathname } from "./artisan-router.web";
// Native keyboard events are hardware adapters, like camera/audio above.
// The product's actual Dock hook still receives and handles these events.
const keyboardListeners = new Map<string, Set<(event: any) => void>>();
let keyboardVisible = false;
Keyboard.isVisible = () => keyboardVisible;
(Keyboard as any).addListener = (
  name: string,
  listener: (event: any) => void,
) => {
  const set = keyboardListeners.get(name) || new Set();
  set.add(listener);
  keyboardListeners.set(name, set);
  return {
    remove: () => {
      set.delete(listener);
    },
  };
};
(globalThis as any).__runtimeKeyboard = (visible: boolean) => {
  keyboardVisible = visible;
  for (const name of visible
    ? ["keyboardWillShow", "keyboardDidShow"]
    : ["keyboardWillHide", "keyboardDidHide"])
    keyboardListeners
      .get(name)
      ?.forEach((fn) =>
        fn({ duration: 0, endCoordinates: { height: visible ? 320 : 0 } }),
      );
};
if (new URLSearchParams(location.search).has("large")) {
  const original = Dimensions.get.bind(Dimensions);
  Dimensions.get = (name) => ({ ...original(name), fontScale: 2 });
}
function Runtime() {
  const route = usePathname();
  const exact: Record<string, typeof Home> = {
    "/artisan": Home,
    "/artisan-workspace": Workspace,
    "/artisan-workspace/opportunities": Opportunities,
    "/artisan-workspace/missions": Missions,
    "/artisan-workspace/agenda": Agenda,
    "/artisan-workspace/clients": Clients,
    "/artisan-workspace/quotes": Quotes,
    "/artisan-workspace/finance": Finance,
    "/artisan-workspace/profile": Profile,
    "/artisan-workspace/notifications": Notifications,
    "/artisan-workspace/rafi": Rafi,
  };
  const Screen =
    exact[route] ||
    (route.startsWith("/mission/")
      ? Mission
      : route.startsWith("/artisan-workspace/opportunity/")
        ? Opportunity
        : route.startsWith("/artisan-workspace/evidence/")
          ? Evidence
          : route.startsWith("/artisan-workspace/client/")
            ? Client
            : route.startsWith("/artisan-workspace/quote/")
              ? Quote
              : Home);
  return (
    <SafeAreaInsetsContext.Provider
      value={{ top: 24, bottom: 16, left: 0, right: 0 }}
    >
      <Screen key={route} />
    </SafeAreaInsetsContext.Provider>
  );
}
async function start() {
  const session = await (globalThis as any).__freshSession();
  const { error } = await supabase.auth.setSession({
    access_token: session.token,
    refresh_token: session.refresh,
  });
  if (error) throw new Error("FRESH_SESSION_REJECTED");
  createRoot(document.getElementById("root")!).render(createElement(Runtime));
}
void start();
