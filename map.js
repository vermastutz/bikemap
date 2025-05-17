import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1Ijoic3R2ZXJtYSIsImEiOiJjbWFyOXlidm0wOGxwMmtvcjNxa3B0eWg4In0.nh2pPaK503wYZ7laLeNAXQ';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id
    );
  
    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id
    );
  
    return stations.map((station) => {
      const id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });
  }
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  
  function filterTripsByTime(trips, timeFilter) {
    return timeFilter === -1
      ? trips
      : trips.filter((trip) => {
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });
  }
  const stationFlow = d3.scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);

map.on('load', async () => {
    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });
  
    map.addLayer({
      id: 'bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: {
        'line-color': '#32D400',
        'line-width': 4,
        'line-opacity': 0.5,
      }
    });
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
      });
      
      // Cambridge bike lanes
      map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
          'line-color': '#32D400',
          'line-width': 4,
          'line-opacity': 0.5,
        },
      });

      const jsonUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
      const jsonData = await d3.json(jsonUrl);
      let stations = jsonData.data.stations;
      console.log('Stations:', stations);

      const svg = d3.select('#map').select('svg');
    
        const trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                return trip;
            }
            );

        console.log('Trips loaded:', trips.length);

        const departures = d3.rollup(
            trips,
            v => v.length,
            d => d.start_station_id
        );

        const arrivals = d3.rollup(
            trips,
            v => v.length,
            d => d.end_station_id
            );

        stations = stations.map((station) => {
            const id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
            });

            console.log('Stations with traffic data:', stations);

        // Radius scale now that traffic is available
        const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

        // Append circles
        const circles = svg
        .selectAll('circle')
        .data(stations)
        .enter()
        .append('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.6);

        circles.each(function (d) {
            d3.select(this)
              .append('title')
              .text(
                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
              );
          });

        function updateScatterPlot(timeFilter) {
            const filteredTrips = filterTripsByTime(trips, timeFilter);
            const filteredStations = computeStationTraffic(stations, filteredTrips);

            // Update radius scale range dynamically
            timeFilter === -1
                ? radiusScale.range([0, 25])
                : radiusScale.range([3, 50]);

            // Update circle sizes
            circles
                .data(filteredStations, (d) => d.short_name)
                .join('circle')
                .attr('r', (d) => radiusScale(d.totalTraffic))
                .style('--departure-ratio', (d) =>
                    stationFlow(d.departures / (d.totalTraffic || 1))  // avoid division by zero
                  );
            }


        // Set positions
        function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx)
            .attr('cy', (d) => getCoords(d).cy);
        }
        updatePositions();

        // Track movement
        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);


        // Select the slider and labels
        const timeSlider = document.getElementById('time-slider');
        const selectedTime = document.getElementById('selected-time');
        const anyTimeLabel = document.getElementById('any-time');

        // Helper: Format minutes since midnight into readable time
        function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes);
        return date.toLocaleString('en-US', { timeStyle: 'short' });
        }

        let timeFilter = Number(timeSlider.value);

        // Function to update the time display
        function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);

        if (timeFilter === -1) {
            selectedTime.textContent = '';
            anyTimeLabel.style.display = 'block';
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none';
        }

        updateScatterPlot(timeFilter);
        }

        // Listen for slider changes
        timeSlider.addEventListener('input', updateTimeDisplay);

        // Run on load to initialize
        updateTimeDisplay();


        




    });

    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
        const { x, y } = map.project(point); // Project to pixel coordinates
        return { cx: x, cy: y }; // Return as object for use in SVG attributes
      }
    

      


  
  