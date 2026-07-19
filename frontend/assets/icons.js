// Only the icons the app actually uses, so the bundle carries ~11 SVG path
// strings instead of the whole @mdi/font webfont + its ~250KB CSS.
// Keyed by the `mdi-*` names stored in topics.json, so the data file and the
// two hardcoded icons (account-group, refresh) map straight through.
import {
  mdiHome,
  mdiHomeHeart,
  mdiHeartBroken,
  mdiHeartOff,
  mdiDotsHorizontal,
  mdiDotsTriangle,
  mdiDotsCircle,
  mdiDotsHexagon,
  mdiLightningBolt,
  mdiAccountGroup,
  mdiRefresh,
} from "@mdi/js";

export default {
  "mdi-home": mdiHome,
  "mdi-home-heart": mdiHomeHeart,
  "mdi-heart-broken": mdiHeartBroken,
  "mdi-heart-off": mdiHeartOff,
  "mdi-dots-horizontal": mdiDotsHorizontal,
  "mdi-dots-triangle": mdiDotsTriangle,
  "mdi-dots-circle": mdiDotsCircle,
  "mdi-dots-hexagon": mdiDotsHexagon,
  "mdi-lightning-bolt": mdiLightningBolt,
  "mdi-account-group": mdiAccountGroup,
  "mdi-refresh": mdiRefresh,
};
