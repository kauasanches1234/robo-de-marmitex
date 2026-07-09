-- Fase 2 — integração front↔back.
-- O painel tem dados que ainda não existiam como coluna: o mapa de entrega
-- (áreas/zonas/lat/lng) e as "peculiaridades" do restaurante. Em vez de criar
-- uma coluna por campo de UI (que muda com frequência), guardamos esse bloco
-- flexível como jsonb. O mapeador (js/mappers.js) lê/escreve em config_extra.
alter table restaurants
  add column if not exists config_extra jsonb not null default '{}'::jsonb;

comment on column restaurants.config_extra is
  'Config só de painel (jsonb): { mapa, peculiaridades }. Ver js/mappers.js.';
