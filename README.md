# Cloudshadow Studios website

Static site served by GitHub Pages (custom domain: cloudshadowstudios.com).

## Layout

| Path | What it is |
| --- | --- |
| `/` | Studio home page (`index.html`) |
| `/habitcrawl/` | Habitcrawl page, plus `support/` and `privacy/` |
| `/little-relay/` | Little Relay page, plus `support/`, `privacy/` and `terms/` |
| `/privacy/`, `/terms/`, `/support/` | Redirects to the Little Relay pages (old App Store links) |
| `assets/` | Styles (`site.css`), the opening fly-through (`flight.js`), fonts, icons, the ridge outline and screenshots |

To change a policy, edit the text inside `<main>` of the page under the app's folder and update its effective date.
Fonts: Newsreader (headlines) and Atkinson Hyperlegible Next (text), self-hosted under the SIL Open Font License.
The site loads nothing from third parties: no analytics, ads or external fonts.

After changing `assets/site.css` or `assets/flight.js`, bump the `?v=` value where the pages link to them so browsers load the new file instead of a cached copy.
