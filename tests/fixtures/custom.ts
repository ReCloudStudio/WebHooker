export const customPayload: Record<string, unknown> = {
  deliveryId: "custom-123",
  title: "Deploy finished",
  repository: {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
  },
  message: "The latest build was deployed to staging.",
};
