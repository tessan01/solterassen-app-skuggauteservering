# Solterrassen ☀

A web app that shows outdoor terraces in Gothenburg and their hours of sun throughout the day. Drag the time slider and watch the map light up: pink dots are in the sun, blue dots are in the shade.

## Features

- Interactive OpenStreetMap map with 25 outdoor terraces in Gothenburg
- Real astronomical calculation of the sun's position for any date
- Time slider with a sun curve and golden hour markers
- Quick time buttons: Morning, Lunch, After Work, Evening
- Detail view per terrace: facing direction, total sun hours, sun window, and a 7-day sun forecast
- Shade warnings ("Sun leaves around 15:45") when the sun is about to disappear
- Leaderboard: sunniest right now, or most sun hours today
- Filter terraces by facing direction (N/E/S/W)
- Add your own spots by clicking the map
- Favorites and a cloudy-day mode

## Tech

- React + Vite
- Leaflet with OpenStreetMap tiles
- Solar position math based on the SunCalc algorithm (no API keys needed)

## Run locally

```bash
npm install
npm run dev
```

Then open the address shown in the terminal, usually `http://localhost:5173`.

## Deploy

The project deploys straight to [Vercel](https://vercel.com) with zero configuration: import the repo and press Deploy.

## Good to know

Sun exposure is calculated from the sun's real position combined with an estimate of each terrace's facing direction and surroundings. Shade from specific buildings is approximated, and clouds are not taken into account. Venue data is a curated demo set, not live data from Google Maps.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
