import { handleSocialRedeem } from "../_shared/social.ts";
import { socialDependencies } from "../_shared/social_runtime.ts";
Deno.serve((request) => handleSocialRedeem(request, socialDependencies()));
