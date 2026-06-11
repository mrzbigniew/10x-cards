import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: "https://6cdf74bcb6c5e263a1d42d97e9001e36@o4511548290170880.ingest.de.sentry.io/4511548297117777",
  // To disable sending user data, uncomment the line below. For more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/#dataCollection
  // dataCollection: { userInfo: false },
  // Enable logs to be sent to Sentry
  enableLogs: true,
  // Define how likely traces are sampled. Adjust this value in production,
  // or use tracesSampler for greater control.
  tracesSampleRate: 1.0,
});
