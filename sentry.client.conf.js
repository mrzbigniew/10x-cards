import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: "https://8012c6d112a073e92bd924e71e7979d4@o4511548896706560.ingest.de.sentry.io/4511548902146128",
  // To disable sending user data, uncomment the line below. For more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/astro/configuration/options/#dataCollection
  // dataCollection: { userInfo: false },
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  // Enable logs to be sent to Sentry
  enableLogs: true,
  // Define how likely traces are sampled. Adjust this value in production,
  // or use tracesSampler for greater control.
  tracesSampleRate: 1.0,
  // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysSessionSampleRate: 0.1,
  // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  replaysOnErrorSampleRate: 1.0,
});
