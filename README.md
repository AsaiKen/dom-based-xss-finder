# DOM based XSS finder

"DOM based XSS finder" is a Chrome extension that finds DOM based XSS vulnerabilities.

Finding DOM based XSS can be bothersome. This extension can be helpful. 

This extension has the following features:

- Notify if a user-input such as "location.href" leads to a dangerous JavaScript function such as "eval".
- Fuzzing for user-inputs such as query, hash and referrer.
- Generate a PoC that generates a alert prompt.

## Usage

- Click the icon and hit "Start".
- Browse pages that you want to scan.
- If the extension finds a possible vulnerability of DOM based XSS, the extension shows a entry for that url.
- Click "Detail" in the entry. A popup window show a source and a sink of the possible vulnerability.
- Click "Check and Generate PoC" in the popup window. You can fuzzing the url.

## License

MIT
