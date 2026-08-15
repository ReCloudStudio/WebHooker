import type { WebhookEvent, Route, FilterNode } from "../types";
import { evaluateFilterNode, containsKeyword, getKeywordBody } from "./filter-ast";

export function eventOwners(event: WebhookEvent): string[] {
  const owners = new Set<string>();
  const repoOwner = (event.payload.repository as { owner?: { login?: string } } | undefined)?.owner
    ?.login;
  if (repoOwner) owners.add(repoOwner);
  const org = (event.payload.organization as { login?: string } | undefined)?.login;
  if (org) owners.add(org);
  return [...owners];
}

export function matchRoute(route: Route, event: WebhookEvent): boolean {
  if (!route.enabled) return false;
  const node: FilterNode = route.ast ?? { all: route.filters };
  const keywordBody = containsKeyword(node) ? getKeywordBody(event) : undefined;
  return evaluateFilterNode(node, event, keywordBody);
}
