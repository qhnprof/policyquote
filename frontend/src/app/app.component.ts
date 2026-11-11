import { Component } from '@angular/core';
import { QuotePageComponent } from './components/quote-page/quote-page.component';

@Component({
  imports: [QuotePageComponent],
  selector: 'app-root',
  styleUrl: './app.component.css',
  templateUrl: './app.component.html',
})
export class App {}
