# Clear

Opinionated spicetify theme reducing screen clutter and improving readability

![Screenshot](images/screenshot1.png)

## On Hover search bar! :D

![On Hover Search Bar](images/onhover.gif)

## Installation (Desktop App)

### On Linux:

1. Make sure you have [spicetify](https://spicetify.app/) installed.

2. Copy `user.css`, `color.ini`, and `theme.js` into your Spicetify Themes directory:
   ```bash
   mkdir -p ~/.config/spicetify/Themes/Clear
   cp user.css color.ini theme.js ~/.config/spicetify/Themes/Clear/
   ```
3. Apply the theme:
   ```bash
   spicetify config current_theme Clear
   spicetify config inject_theme_js 1
   spicetify apply
   ```

### On Windows:

1. Open Powershell as administrator

2. Copy and paste the below code snippet:

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
```

(Installs [spicetify](https://spicetify.app/))

3.  Copy and paste the below code snippet:

```powershell
<>
```

(Installs [Clear Spotify](https://github.com/wktkow/clear-spotify-theme))

4. Enjoy!

## Initial Sources

Clear is based on code from various external sources. You can see the full list
[here](docs/sources.md).
