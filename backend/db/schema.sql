-- AirSense AI — run once in the Supabase SQL editor.
create extension if not exists postgis;

create table if not exists stations (
    id          text primary key,
    name        text not null,
    city        text not null,
    latitude    double precision not null,
    longitude   double precision not null,
    geom        geography(Point, 4326)
                generated always as (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) stored
);
create index if not exists stations_geom_idx on stations using gist (geom);
create index if not exists stations_city_idx on stations (city);

create table if not exists aqi_readings (
    id          bigserial primary key,
    station_id  text not null,
    city        text,
    "timestamp" timestamptz not null,
    pm25        double precision,
    aqi         double precision,
    latitude    double precision,
    longitude   double precision,
    unique (station_id, "timestamp")
);
create index if not exists aqi_readings_station_ts_idx on aqi_readings (station_id, "timestamp" desc);

create table if not exists weather_readings (
    city        text not null,
    "timestamp" timestamptz not null,
    temperature double precision,
    humidity    double precision,
    wind_speed  double precision,
    wind_direction double precision,
    boundary_layer_height double precision,
    primary key (city, "timestamp")
);

create table if not exists forecasts (
    id          bigserial primary key,
    station_id  text not null,
    city        text,
    generated_at timestamptz not null default now(),
    target_time timestamptz not null,
    horizon_hours int,
    aqi         double precision,
    pm25        double precision,
    confidence_lower double precision,
    confidence_upper double precision,
    model       text,
    unique (station_id, generated_at, target_time)
);

create table if not exists alerts (
    id          bigserial primary key,
    city        text,
    station_id  text not null,
    "timestamp" timestamptz not null,
    aqi         double precision,
    level       text,
    message     text,
    created_at  timestamptz not null default now(),
    unique (station_id, "timestamp")
);

-- Model quality log (RMSE vs persistence per city)
create table if not exists model_metrics (
    id          bigserial primary key,
    city        text not null,
    trained_at  timestamptz not null default now(),
    rmse        double precision,
    persistence_rmse double precision,
    samples     int
);
