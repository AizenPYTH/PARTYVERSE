-- PARTYVERSE — Game catalog
-- Server-side source of truth for which games exist, their player bounds,
-- configurable settings and availability. Presentation (icons, colors,
-- renderers) lives in the client registry keyed by the same id.

create table public.game_catalog (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  tagline text not null default '' check (char_length(tagline) <= 80),
  description text not null default '' check (char_length(description) <= 600),
  category text not null check (category in (
    'strategy', 'party', 'trivia', 'social_deduction', 'skill', 'cooperative', 'racing', 'drawing', 'words'
  )),
  min_players smallint not null check (min_players >= 1),
  max_players smallint not null,
  avg_duration_minutes smallint not null check (avg_duration_minutes > 0),
  -- [{ "id": "classic", "name": "Classique", "ranked": true }]
  modes jsonb not null default '[]'::jsonb check (jsonb_typeof(modes) = 'array'),
  availability text not null default 'coming_soon'
    check (availability in ('available', 'beta', 'coming_soon', 'disabled')),
  -- How the game is networked; see docs/architecture/multiplayer.md
  network_model text not null
    check (network_model in ('turn_based_sql', 'turn_based_edge', 'realtime_server')),
  engine_version integer not null default 1 check (engine_version >= 1),
  -- Lobby settings schema: { "settings": { "<key>": { "options": [...], "default": ... } } }
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  sort_order integer not null default 100,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_catalog_player_bounds check (max_players >= min_players and max_players <= 32)
);

create trigger game_catalog_set_updated_at
  before update on public.game_catalog
  for each row execute function app_private.set_updated_at();

alter table public.game_catalog enable row level security;
revoke all on public.game_catalog from anon, authenticated;
grant select on public.game_catalog to anon, authenticated;

create policy "Catalog is readable by everyone"
  on public.game_catalog for select
  to anon, authenticated
  using (availability <> 'disabled');

-- Reference data. Only Connect Four has a server engine today; the others are
-- listed honestly as coming soon and cannot be selected for a lobby.
insert into public.game_catalog
  (id, name, tagline, description, category, min_players, max_players, avg_duration_minutes,
   modes, availability, network_model, rules, sort_order, released_at)
values
  ('connect_four', 'Connect Four', 'Aligne quatre jetons avant ton adversaire.',
   'Le classique du tour par tour : fais tomber tes jetons dans la grille et aligne-en quatre, '
   'horizontalement, verticalement ou en diagonale. Chaque coup est validé par le serveur.',
   'strategy', 2, 2, 5,
   '[{"id":"classic","name":"Classique","ranked":true}]',
   'available', 'turn_based_sql',
   '{"settings":{"turn_seconds":{"options":[30,60,120],"default":60}}}',
   10, now()),
  ('chess_arena', 'Chess Arena', 'Échecs classiques, blitz et bullet.',
   'Échecs multijoueurs avec pendule autoritaire, Chess960 et classement Elo dédié.',
   'strategy', 2, 2, 15,
   '[{"id":"classic","name":"Classique","ranked":true},{"id":"blitz","name":"Blitz","ranked":true},{"id":"bullet","name":"Bullet","ranked":true},{"id":"chess960","name":"Chess960","ranked":true}]',
   'coming_soon', 'turn_based_edge', '{}', 20, null),
  ('quiz_rush', 'Quiz Rush', 'Le quiz multijoueur le plus rapide.',
   'Questions chronométrées dans neuf catégories, duels, équipes et combos.',
   'trivia', 2, 8, 8,
   '[{"id":"duel","name":"Duel","ranked":true},{"id":"party","name":"Party","ranked":false}]',
   'coming_soon', 'turn_based_edge', '{}', 30, null),
  ('impostor', 'Impostor', 'Démasque celui qui n''a pas le mot.',
   'Jeu de déduction sociale : chacun reçoit un mot secret, sauf l''imposteur.',
   'social_deduction', 3, 12, 12,
   '[{"id":"classic","name":"Classique","ranked":false}]',
   'coming_soon', 'turn_based_edge', '{}', 40, null),
  ('draw_guess', 'Draw & Guess', 'Dessine, devine, marque des points.',
   'Dessin en temps réel et devinettes de 2 à 8 joueurs.',
   'drawing', 2, 8, 15,
   '[{"id":"classic","name":"Classique","ranked":false}]',
   'coming_soon', 'realtime_server', '{}', 50, null),
  ('pocket_pool', 'Pocket Pool', 'Billard 8-ball et 9-ball.',
   'Billard multijoueur avec physique déterministe validée par le serveur.',
   'skill', 1, 2, 10,
   '[{"id":"eight_ball","name":"8-ball","ranked":true},{"id":"nine_ball","name":"9-ball","ranked":true}]',
   'coming_soon', 'realtime_server', '{}', 60, null),
  ('mini_golf_clash', 'Mini Golf Clash', 'Parcours, obstacles et précision.',
   'Mini-golf jusqu''à 4 joueurs sur des parcours variés.',
   'skill', 1, 4, 10,
   '[{"id":"classic","name":"Classique","ranked":false}]',
   'coming_soon', 'realtime_server', '{}', 70, null),
  ('mindlink', 'Mindlink', 'Pensez la même chose, au même moment.',
   'Jeu d''association d''idées en équipes ou en duo.',
   'words', 2, 8, 8,
   '[{"id":"duo","name":"Duo","ranked":false}]',
   'coming_soon', 'turn_based_edge', '{}', 80, null),
  ('micro_racers', 'Micro Racers', 'Courses arcade express.',
   'Courses courtes à plusieurs avec bonus et circuits.',
   'racing', 2, 8, 5,
   '[{"id":"classic","name":"Classique","ranked":false}]',
   'coming_soon', 'realtime_server', '{}', 90, null),
  ('bomb_squad', 'Bomb Squad', 'Communiquez pour désamorcer.',
   'Coopération asymétrique : un joueur voit la bombe, les autres le manuel.',
   'cooperative', 2, 6, 10,
   '[{"id":"coop","name":"Coopératif","ranked":false}]',
   'coming_soon', 'turn_based_edge', '{}', 100, null);

-- Validates lobby settings against the catalog's settings schema and fills
-- defaults. Unknown keys are rejected.
create or replace function app_private.normalize_game_settings(p_game_id text, p_settings jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_schema jsonb;
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_def jsonb;
  v_value jsonb;
begin
  select coalesce(rules -> 'settings', '{}'::jsonb)
    into v_schema
    from public.game_catalog
   where id = p_game_id;

  if v_schema is null then
    raise exception 'PV_GAME_NOT_FOUND';
  end if;

  p_settings := coalesce(p_settings, '{}'::jsonb);
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'PV_INVALID_SETTINGS';
  end if;

  for v_key in select jsonb_object_keys(p_settings) loop
    if not v_schema ? v_key then
      raise exception 'PV_INVALID_SETTINGS' using hint = v_key;
    end if;
  end loop;

  for v_key, v_def in select key, value from jsonb_each(v_schema) loop
    v_value := coalesce(p_settings -> v_key, v_def -> 'default');
    if not (v_def -> 'options') @> jsonb_build_array(v_value) then
      raise exception 'PV_INVALID_SETTINGS' using hint = v_key;
    end if;
    v_result := v_result || jsonb_build_object(v_key, v_value);
  end loop;

  return v_result;
end;
$$;
