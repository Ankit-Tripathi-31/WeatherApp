const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_PLACE = { id: "london-gb", name: "London", country: "United Kingdom", latitude: 51.5072, longitude: -0.1276 };
const FAVORITES_KEY = "daylight-favorite-places";
const UNIT_KEY = "daylight-temperature-unit";

const elements = {
  addPlace: document.querySelector("#add-place-button"),
  currentDate: document.querySelector("#current-date"),
  currentLocation: document.querySelector("#current-location"),
  currentTemperature: document.querySelector("#current-temperature"),
  dailyForecast: document.querySelector("#daily-forecast"),
  details: document.querySelector("#weather-details"),
  favoriteButton: document.querySelector("#favorite-button"),
  favoriteLabel: document.querySelector("#favorite-label"),
  feelsLike: document.querySelector("#feels-like"),
  heroArt: document.querySelector("#hero-art"),
  heroHumidity: document.querySelector("#hero-humidity"),
  heroRain: document.querySelector("#hero-rain"),
  heroSummary: document.querySelector("#hero-summary"),
  heroWind: document.querySelector("#hero-wind"),
  hourlyForecast: document.querySelector("#hourly-forecast"),
  loading: document.querySelector("#loading-state"),
  locationButton: document.querySelector("#location-button"),
  notice: document.querySelector("#notice"),
  savedList: document.querySelector("#saved-list"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#city-search"),
  suggestions: document.querySelector("#search-suggestions"),
  temperatureUnit: document.querySelector("#unit-toggle"),
  weatherCondition: document.querySelector("#weather-condition"),
  weatherContent: document.querySelector("#weather-content"),
};

let currentPlace = DEFAULT_PLACE;
let currentWeather = null;
let temperatureUnit = localStorage.getItem(UNIT_KEY) === "fahrenheit" ? "fahrenheit" : "celsius";
let favoritePlaces = readFavorites();
let searchResults = [];
let searchTimer;
let searchRequest = 0;
let weatherRequest = 0;

const weatherDescriptions = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Rain showers", 82: "Heavy showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
};

const weatherEmojis = {
  sun: "☀️", moon: "🌙", partly: "⛅", cloud: "☁️", fog: "🌫️",
  drizzle: "🌦️", rain: "🌧️", snow: "❄️", storm: "⛈️",
};

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidPlace) : [];
  } catch (error) {
    console.error("Could not read saved places.", error);
    return [];
  }
}

function isValidPlace(place) {
  return place && typeof place.id === "string" && typeof place.name === "string"
    && typeof place.country === "string" && Number.isFinite(place.latitude)
    && Number.isFinite(place.longitude);
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritePlaces));
  } catch (error) {
    console.error("Could not save places.", error);
    showNotice("Your browser couldn't save this place. Check your storage settings and try again.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function getDescription(code) {
  return weatherDescriptions[code] || "Weather unavailable";
}

function getWeatherEmoji(code, isDay = true) {
  if (code === 0) return isDay ? weatherEmojis.sun : weatherEmojis.moon;
  if (code <= 2) return weatherEmojis.partly;
  if (code === 3) return weatherEmojis.cloud;
  if (code <= 48) return weatherEmojis.fog;
  if (code <= 57) return weatherEmojis.drizzle;
  if (code <= 67 || (code >= 80 && code <= 82)) return weatherEmojis.rain;
  if (code <= 77 || (code >= 85 && code <= 86)) return weatherEmojis.snow;
  return weatherEmojis.storm;
}

function formatTemperature(value) {
  if (!Number.isFinite(value)) return "--°";
  const temperature = temperatureUnit === "fahrenheit" ? (value * 9) / 5 + 32 : value;
  return `${Math.round(temperature)}°`;
}

function unitLabel() {
  return temperatureUnit === "fahrenheit" ? "°F" : "°C";
}

function formatTime(dateString, options = {}) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", ...options }).format(new Date(dateString));
}

function formatDay(dateString, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${dateString}T12:00:00Z`));
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = false;
}

function clearNotice() {
  elements.notice.hidden = true;
  elements.notice.textContent = "";
}

function placeLabel(place) {
  return place.country ? `${place.name}, ${place.country}` : place.name;
}

async function loadWeather(place) {
  const requestId = ++weatherRequest;
  currentPlace = place;
  elements.loading.hidden = false;
  elements.weatherContent.hidden = true;
  clearNotice();

  const url = new URL(FORECAST_URL);
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,uv_index,visibility",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    timezone: "auto",
    forecast_days: "7",
  }).toString();

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Forecast service returned ${response.status}`);
    const data = await response.json();
    if (!data.current || !data.daily || !data.hourly) throw new Error("Forecast data was incomplete.");
    if (requestId !== weatherRequest) return;
    currentWeather = data;
    renderWeather(data, place);
    elements.loading.hidden = true;
    elements.weatherContent.hidden = false;
    renderSavedPlaces();
  } catch (error) {
    if (requestId !== weatherRequest) return;
    console.error("Could not load forecast.", error);
    elements.loading.hidden = true;
    elements.weatherContent.hidden = true;
    showNotice("We couldn't load this forecast. Check your internet connection and try again.");
  }
}

function renderWeather(data, place) {
  const current = data.current;
  const daily = data.daily;
  const localNow = new Date();
  elements.currentLocation.textContent = placeLabel(place);
  elements.currentDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "short", day: "numeric", timeZone: data.timezone,
  }).format(localNow);
  elements.currentTemperature.textContent = formatTemperature(current.temperature_2m);
  elements.weatherCondition.textContent = getDescription(current.weather_code);
  elements.feelsLike.textContent = `Feels like ${formatTemperature(current.apparent_temperature)}`;
  elements.heroSummary.textContent = `${getDescription(current.weather_code)} around ${formatTemperature(current.temperature_2m)}. ${daily.precipitation_probability_max?.[0] ?? 0}% chance of rain today.`;
  elements.heroWind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  elements.heroHumidity.textContent = `${current.relative_humidity_2m}%`;
  elements.heroRain.textContent = `${daily.precipitation_probability_max?.[0] ?? 0}%`;
  elements.heroArt.dataset.condition = current.weather_code;
  renderHourly(data.hourly, current.time);
  renderDaily(daily);
  renderDetails(data);
  renderFavoriteButton();
  updateUnitButton();
}

function renderHourly(hourly, currentTime) {
  const startIndex = Math.max(0, hourly.time.findIndex((time) => time >= currentTime));
  const times = hourly.time.slice(startIndex, startIndex + 24);
  const html = times.map((time, index) => {
    const dataIndex = startIndex + index;
    const hourLabel = index === 0 ? "Now" : formatTime(time, { timeZone: currentWeather.timezone });
    const chance = hourly.precipitation_probability?.[dataIndex] ?? 0;
    return `<div class="hour-item">
      <span class="hour-time">${escapeHtml(hourLabel)}</span>
      <span class="hour-icon" aria-hidden="true">${getWeatherEmoji(hourly.weather_code[dataIndex], true)}</span>
      <span class="hour-temp">${formatTemperature(hourly.temperature_2m[dataIndex])}</span>
      <span class="hour-rain">${chance >= 20 ? `${chance}% rain` : "&nbsp;"}</span>
    </div>`;
  }).join("");
  elements.hourlyForecast.innerHTML = html || '<p class="empty-forecast">Hourly forecast is unavailable.</p>';
}

function renderDaily(daily) {
  const minTemperature = Math.min(...daily.temperature_2m_min);
  const maxTemperature = Math.max(...daily.temperature_2m_max);
  elements.dailyForecast.innerHTML = daily.time.map((date, index) => {
    const low = daily.temperature_2m_min[index];
    const high = daily.temperature_2m_max[index];
    const range = maxTemperature === minTemperature ? 50 : ((low - minTemperature) / (maxTemperature - minTemperature)) * 55 + 12;
    const width = maxTemperature === minTemperature ? 50 : ((high - low) / (maxTemperature - minTemperature)) * 45 + 25;
    const rain = daily.precipitation_probability_max?.[index] ?? 0;
    return `<div class="daily-row">
      <span class="daily-day">${formatDay(date, index)}</span>
      <span class="daily-icon" aria-hidden="true">${getWeatherEmoji(daily.weather_code[index])}</span>
      <span class="daily-rain">${rain >= 20 ? `${rain}%` : ""}</span>
      <span class="daily-low">${formatTemperature(low)}</span>
      <span class="daily-range" aria-label="Temperature range"><span style="margin-left:${range}%;width:${width}%"></span></span>
      <span class="daily-high">${formatTemperature(high)}</span>
    </div>`;
  }).join("");
}

function renderDetails(data) {
  const current = data.current;
  const daily = data.daily;
  const items = [
    { icon: "☀", label: "UV index", value: Number(current.uv_index).toFixed(1), extra: "Current level" },
    { icon: "◉", label: "Visibility", value: `${(current.visibility / 1000).toFixed(1)} km`, extra: "Around you" },
    { icon: "↗", label: "Wind direction", value: `${Math.round(current.wind_direction_10m)}°`, extra: compassDirection(current.wind_direction_10m) },
    { icon: "◷", label: "Pressure", value: `${Math.round(current.pressure_msl)} hPa`, extra: "Sea-level pressure" },
    { icon: "↑", label: "Sunrise", value: formatTime(daily.sunrise[0], { timeZone: data.timezone }), extra: "Local time" },
    { icon: "↓", label: "Sunset", value: formatTime(daily.sunset[0], { timeZone: data.timezone }), extra: "Local time" },
  ];
  elements.details.innerHTML = items.map((item) => `<div class="detail-item">
    <div class="detail-label"><span class="detail-icon" aria-hidden="true">${item.icon}</span>${item.label}</div>
    <div class="detail-value">${escapeHtml(item.value)}</div>
    <div class="detail-extra">${escapeHtml(item.extra)}</div>
  </div>`).join("");
}

function compassDirection(degrees) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % directions.length];
}

function renderFavoriteButton() {
  const isSaved = favoritePlaces.some((place) => place.id === currentPlace.id);
  elements.favoriteButton.classList.toggle("saved", isSaved);
  elements.favoriteButton.querySelector("span").textContent = isSaved ? "★" : "☆";
  elements.favoriteLabel.textContent = isSaved ? "Saved to your places" : "Save this place";
}

function renderSavedPlaces() {
  elements.savedList.innerHTML = favoritePlaces.map((place) => {
    const active = place.id === currentPlace.id;
    const temperature = active && currentWeather ? formatTemperature(currentWeather.current.temperature_2m) : "";
    return `<button class="saved-place${active ? " active" : ""}" type="button" data-place-id="${escapeHtml(place.id)}" aria-label="Show weather for ${escapeHtml(placeLabel(place))}">
      <span class="saved-place-icon" aria-hidden="true">${active && currentWeather ? getWeatherEmoji(currentWeather.current.weather_code, currentWeather.current.is_day === 1) : "📍"}</span>
      <span class="saved-place-copy"><span class="saved-place-name">${escapeHtml(place.name)}</span><span class="saved-place-country">${escapeHtml(place.country)}</span></span>
      ${temperature ? `<span class="saved-place-temp">${temperature}</span>` : ""}
    </button>`;
  }).join("");
}

function updateUnitButton() {
  const celsiusClass = temperatureUnit === "celsius" ? "selected-unit" : "";
  const fahrenheitClass = temperatureUnit === "fahrenheit" ? "selected-unit" : "";
  elements.temperatureUnit.innerHTML = `<span class="${celsiusClass}">°C</span><span>/</span><span class="${fahrenheitClass}">°F</span>`;
  elements.temperatureUnit.setAttribute("aria-label", `Switch to ${temperatureUnit === "celsius" ? "Fahrenheit" : "Celsius"}`);
}

function normalizePlace(result) {
  return {
    id: `${result.id ?? `${result.latitude},${result.longitude}`}`,
    name: result.name,
    country: result.country || result.admin1 || "",
    latitude: result.latitude,
    longitude: result.longitude,
  };
}

async function searchPlaces(query) {
  const requestId = ++searchRequest;
  if (query.trim().length < 2) {
    elements.suggestions.hidden = true;
    return [];
  }
  try {
    const url = new URL(GEOCODING_URL);
    url.search = new URLSearchParams({ name: query.trim(), count: "6", language: "en", format: "json" }).toString();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding service returned ${response.status}`);
    const result = await response.json();
    if (requestId !== searchRequest) return [];
    const places = (result.results || []).map(normalizePlace);
    renderSuggestions(places);
    return places;
  } catch (error) {
    if (requestId === searchRequest) {
      console.error("Could not search for places.", error);
      elements.suggestions.innerHTML = '<div class="search-suggestion">City search is unavailable. Try again shortly.</div>';
      elements.suggestions.hidden = false;
    }
    return [];
  }
}

function renderSuggestions(places) {
  searchResults = places;
  if (!places.length) {
    elements.suggestions.innerHTML = '<div class="search-suggestion">No cities found. Try another spelling.</div>';
    elements.suggestions.hidden = false;
    return;
  }
  elements.suggestions.innerHTML = places.map((place, index) => `<button class="search-suggestion" type="button" role="option" data-result-index="${index}">
    <span class="suggestion-pin" aria-hidden="true">⌖</span>
    <span class="suggestion-info"><span class="suggestion-name">${escapeHtml(place.name)}</span><span class="suggestion-country">${escapeHtml(placeLabel(place))}</span></span>
  </button>`).join("");
  elements.suggestions.hidden = false;
}

async function submitSearch(event) {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (!query) {
    elements.searchInput.focus();
    return;
  }
  elements.suggestions.hidden = true;
  const places = await searchPlaces(query);
  if (!places.length) return;
  selectPlace(places[0]);
}

function selectPlace(place) {
  elements.searchInput.value = "";
  elements.suggestions.hidden = true;
  loadWeather(place);
}

function toggleFavorite() {
  if (favoritePlaces.some((place) => place.id === currentPlace.id)) {
    favoritePlaces = favoritePlaces.filter((place) => place.id !== currentPlace.id);
  } else {
    favoritePlaces = [currentPlace, ...favoritePlaces].slice(0, 8);
  }
  saveFavorites();
  renderFavoriteButton();
  renderSavedPlaces();
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showNotice("Location isn't available in this browser. You can search for any city instead.");
    return;
  }
  elements.locationButton.disabled = true;
  navigator.geolocation.getCurrentPosition(async (position) => {
    elements.locationButton.disabled = false;
    const place = {
      id: `coordinates-${position.coords.latitude.toFixed(3)}-${position.coords.longitude.toFixed(3)}`,
      name: "My location",
      country: "",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    await loadWeather(place);
  }, (error) => {
    elements.locationButton.disabled = false;
    const messages = {
      1: "Location permission was denied. Allow location access in your browser or search for a city.",
      2: "Your location couldn't be determined. Try again or search for a city.",
      3: "Location lookup timed out. Try again or search for a city.",
    };
    showNotice(messages[error.code] || "Location couldn't be accessed. You can search for any city instead.");
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

elements.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = elements.searchInput.value.trim();
  if (query.length < 2) {
    elements.suggestions.hidden = true;
    return;
  }
  searchTimer = setTimeout(() => searchPlaces(query), 250);
});

elements.searchForm.addEventListener("submit", submitSearch);
elements.suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-result-index]");
  if (!button) return;
  const place = searchResults[Number(button.dataset.resultIndex)];
  if (place) selectPlace(place);
});

elements.savedList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-place-id]");
  if (!button) return;
  const place = favoritePlaces.find((favorite) => favorite.id === button.dataset.placeId);
  if (place) loadWeather(place);
});

elements.favoriteButton.addEventListener("click", toggleFavorite);
elements.locationButton.addEventListener("click", useCurrentLocation);
elements.addPlace.addEventListener("click", () => {
  elements.searchInput.focus();
  elements.searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
});
elements.temperatureUnit.addEventListener("click", () => {
  temperatureUnit = temperatureUnit === "celsius" ? "fahrenheit" : "celsius";
  localStorage.setItem(UNIT_KEY, temperatureUnit);
  updateUnitButton();
  if (currentWeather) loadWeather(currentPlace);
});

document.addEventListener("click", (event) => {
  if (!elements.searchForm.contains(event.target)) elements.suggestions.hidden = true;
});

renderSavedPlaces();
loadWeather(DEFAULT_PLACE);
