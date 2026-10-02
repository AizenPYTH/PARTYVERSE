-- PARTYVERSE — Impostor (engine: supabase/functions/_shared/engines/impostor.ts)
-- Word pairs stay in app_private; each player only ever receives their own
-- word through match_private_state.

create table app_private.impostor_words (
  id bigint generated always as identity primary key,
  word_a text not null check (char_length(word_a) between 2 and 30),
  word_b text not null check (char_length(word_b) between 2 and 30),
  active boolean not null default true,
  unique (word_a, word_b)
);
alter table app_private.impostor_words enable row level security;
revoke all on app_private.impostor_words from public, anon, authenticated;

insert into app_private.impostor_words (word_a, word_b) values
  ('Chat', 'Chien'),
  ('Café', 'Thé'),
  ('Plage', 'Piscine'),
  ('Guitare', 'Violon'),
  ('Pizza', 'Hamburger'),
  ('Avion', 'Hélicoptère'),
  ('Train', 'Métro'),
  ('Lune', 'Soleil'),
  ('Pomme', 'Poire'),
  ('Vélo', 'Trottinette'),
  ('Cinéma', 'Théâtre'),
  ('Football', 'Rugby'),
  ('Montagne', 'Colline'),
  ('Lion', 'Tigre'),
  ('Neige', 'Pluie'),
  ('Stylo', 'Crayon'),
  ('Ordinateur', 'Tablette'),
  ('Boulangerie', 'Pâtisserie'),
  ('Château', 'Palais'),
  ('Fourchette', 'Cuillère'),
  ('Bateau', 'Sous-marin'),
  ('Piano', 'Orgue'),
  ('Hiver', 'Automne'),
  ('Sorcière', 'Fée'),
  ('Vampire', 'Loup-garou'),
  ('Dentiste', 'Médecin'),
  ('Bibliothèque', 'Librairie'),
  ('Chocolat', 'Caramel'),
  ('Fraise', 'Framboise'),
  ('Requin', 'Dauphin'),
  ('Miel', 'Confiture'),
  ('Camping', 'Hôtel'),
  ('Peinture', 'Dessin'),
  ('Roi', 'Président'),
  ('Jungle', 'Forêt'),
  ('Fusée', 'Satellite'),
  ('Glace', 'Sorbet'),
  ('Chemise', 'Tee-shirt'),
  ('Lit', 'Canapé'),
  ('Abeille', 'Guêpe'),
  ('Oreiller', 'Couverture'),
  ('Cirque', 'Zoo'),
  ('Église', 'Cathédrale'),
  ('Pharmacie', 'Hôpital'),
  ('Mariage', 'Anniversaire'),
  ('Télévision', 'Radio'),
  ('Montre', 'Réveil'),
  ('Valise', 'Sac à dos'),
  ('Carotte', 'Radis'),
  ('Escalier', 'Ascenseur');

create or replace function app_private.impostor_start_data(p_settings jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select jsonb_build_object('a', word_a, 'b', word_b)
    from app_private.impostor_words
   where active
   order by random()
   limit 1;
$$;
revoke all on function app_private.impostor_start_data(jsonb) from public, anon, authenticated;

update public.game_catalog
   set tagline = 'Démasque celui qui n''a pas le mot.',
       description = 'Chacun reçoit un mot secret, sauf l''imposteur qui en a un proche (ou aucun). Indices à tour de rôle, '
                     'discussion, vote secret. Démasqué, l''imposteur peut encore gagner en devinant le mot. De 3 à 12 joueurs.',
       min_players = 3,
       max_players = 12,
       avg_duration_minutes = 8,
       modes = '[{"id":"classic","name":"Classique","ranked":false}]',
       availability = 'available',
       network_model = 'turn_based_engine',
       rules = '{"settings":{"mode":{"options":["word","blank"],"default":"word"},"rounds":{"options":[1,2,3],"default":2},'
               '"turn_seconds":{"options":[20,30,45],"default":30},"discussion_seconds":{"options":[30,60,90],"default":60}}}',
       sort_order = 22,
       released_at = now()
 where id = 'impostor';
