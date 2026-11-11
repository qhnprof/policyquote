import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Uses the fetch API: FetchBackend is the default in Angular 22 (withFetch() is deprecated).
    provideHttpClient(),
  ],
};
