import { apiMerge } from "../../lib/web/actions";

export default defineEventHandler((event) => apiMerge(event));
