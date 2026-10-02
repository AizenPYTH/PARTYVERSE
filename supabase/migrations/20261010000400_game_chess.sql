-- PARTYVERSE — Chess Arena (engine: supabase/functions/_shared/engines/chess.ts, rules by chess.js)
-- Three ranked time controls, each with its own Elo ladder (player_ratings.mode).
update public.game_catalog
   set name = 'Chess Arena',
       tagline = 'Échecs en ligne, pendule autoritaire.',
       description = 'Échecs complets : roque, prise en passant, promotion, échec et mat, pat, répétition, '
                     'règle des 50 coups. Coups validés par le serveur avec chess.js, pendule tenue par le serveur, '
                     'propositions de nulle et historique des coups.',
       min_players = 2,
       max_players = 2,
       avg_duration_minutes = 10,
       modes = '[{"id":"bullet","name":"Bullet 1+0","ranked":true,"settings":{"time_control":"bullet"}},
                 {"id":"blitz","name":"Blitz 3+2","ranked":true,"settings":{"time_control":"blitz"}},
                 {"id":"rapid","name":"Rapide 10+5","ranked":true,"settings":{"time_control":"rapid"}}]',
       availability = 'available',
       network_model = 'turn_based_engine',
       rules = '{"settings":{"time_control":{"options":["bullet","blitz","rapid"],"default":"blitz"}}}',
       sort_order = 15,
       released_at = now()
 where id = 'chess_arena';
