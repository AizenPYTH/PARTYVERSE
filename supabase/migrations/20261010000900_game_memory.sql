-- PARTYVERSE — Memory (engine: supabase/functions/_shared/engines/memory.ts)
-- The deck order stays in match_server_state; only flipped and matched cards are public.
insert into public.game_catalog
  (id, name, tagline, description, category, min_players, max_players, avg_duration_minutes,
   modes, availability, network_model, rules, sort_order, released_at)
values
  ('memory_match', 'Memory', 'Retrouve les paires avant les autres.',
   'Retourne deux cartes par tour : une paire te fait marquer et rejouer. Le paquet est mélangé et gardé par '
   'le serveur, seules les cartes retournées sont visibles. De 2 à 4 joueurs.',
   'memory', 2, 4, 6,
   '[{"id":"classic","name":"Classique","ranked":false}]',
   'available', 'turn_based_engine',
   '{"settings":{"pairs":{"options":[8,12,18],"default":8},"turn_seconds":{"options":[10,15,20],"default":15}}}',
   23, now())
on conflict (id) do nothing;
