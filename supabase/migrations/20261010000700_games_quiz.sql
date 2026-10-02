-- PARTYVERSE — Quiz Rush and Calcul Express
-- Engines: supabase/functions/_shared/engines/{quiz-core,quiz-rush,mental-math}.ts
--
-- The question bank lives in app_private (not exposed by the API): answers
-- reach the engine through engine_prepare_start only, and the public match
-- state reveals an answer only once its question is closed.

create table app_private.quiz_questions (
  id text primary key,
  category text not null check (category in ('general', 'history', 'geography', 'science', 'cinema', 'video_games', 'sport', 'technology', 'music')),
  difficulty smallint not null check (difficulty between 1 and 3),
  prompt text not null check (char_length(prompt) between 5 and 200),
  answer text not null check (char_length(answer) between 1 and 80),
  wrong text[] not null check (cardinality(wrong) = 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table app_private.quiz_questions enable row level security;
revoke all on app_private.quiz_questions from public, anon, authenticated;

insert into app_private.quiz_questions (id, category, difficulty, prompt, answer, wrong) values
  ('general-01', 'general', 1, 'Combien de jours compte une année bissextile ?', '366', array['365', '364', '367']),
  ('general-02', 'general', 1, 'Quelle couleur obtient-on en mélangeant du bleu et du jaune ?', 'Vert', array['Violet', 'Orange', 'Marron']),
  ('general-03', 'general', 1, 'Combien de côtés a un hexagone ?', '6', array['5', '7', '8']),
  ('general-04', 'general', 2, 'Dans quelle ville se trouve la statue du Christ Rédempteur ?', 'Rio de Janeiro', array['São Paulo', 'Lisbonne', 'Buenos Aires']),
  ('general-05', 'general', 2, 'Combien de cartes compte un jeu de tarot français ?', '78', array['52', '54', '64']),
  ('general-06', 'general', 2, 'Quel animal est l’emblème du WWF ?', 'Le panda géant', array['Le tigre', 'L’ours polaire', 'L’éléphant']),
  ('general-07', 'general', 2, 'Quelle est la monnaie du Japon ?', 'Le yen', array['Le won', 'Le yuan', 'Le ringgit']),
  ('general-08', 'general', 3, 'Quelle langue compte le plus de locuteurs natifs au monde ?', 'Le chinois mandarin', array['L’anglais', 'L’espagnol', 'L’hindi']),
  ('general-09', 'general', 3, 'Combien de pièces compte un jeu d’échecs complet ?', '32', array['24', '30', '36']),
  ('general-10', 'general', 3, 'Combien de cases compte le plateau du Monopoly ?', '40', array['36', '44', '48']),
  ('history-01', 'history', 1, 'En quelle année a eu lieu la prise de la Bastille ?', '1789', array['1776', '1799', '1815']),
  ('history-02', 'history', 1, 'Qui a été le premier homme à marcher sur la Lune ?', 'Neil Armstrong', array['Buzz Aldrin', 'Youri Gagarine', 'John Glenn']),
  ('history-03', 'history', 1, 'Quel conflit s’est déroulé de 1939 à 1945 ?', 'La Seconde Guerre mondiale', array['La Première Guerre mondiale', 'La guerre de Corée', 'La guerre froide']),
  ('history-04', 'history', 2, 'En quelle année le mur de Berlin est-il tombé ?', '1989', array['1991', '1985', '1979']),
  ('history-05', 'history', 2, 'Quel empereur a été exilé sur l’île de Sainte-Hélène ?', 'Napoléon Ier', array['Napoléon III', 'Louis XVIII', 'Charles X']),
  ('history-06', 'history', 2, 'Quelle civilisation a bâti le Machu Picchu ?', 'Les Incas', array['Les Aztèques', 'Les Mayas', 'Les Olmèques']),
  ('history-07', 'history', 2, 'Qui fut le premier président de la Ve République ?', 'Charles de Gaulle', array['Georges Pompidou', 'René Coty', 'Vincent Auriol']),
  ('history-08', 'history', 3, 'En quelle année Christophe Colomb a-t-il atteint l’Amérique ?', '1492', array['1453', '1515', '1498']),
  ('history-09', 'history', 3, 'Quel pharaon a vu son tombeau découvert par Howard Carter en 1922 ?', 'Toutânkhamon', array['Ramsès II', 'Khéops', 'Akhenaton']),
  ('history-10', 'history', 3, 'En quelle année l’Empire romain d’Occident a-t-il pris fin ?', '476', array['410', '395', '1453']),
  ('geography-01', 'geography', 1, 'Quelle est la capitale de l’Italie ?', 'Rome', array['Milan', 'Naples', 'Florence']),
  ('geography-02', 'geography', 1, 'Quel est le plus grand océan du monde ?', 'Le Pacifique', array['L’Atlantique', 'L’océan Indien', 'L’Arctique']),
  ('geography-03', 'geography', 1, 'Quel est le plus haut sommet du monde ?', 'L’Everest', array['Le K2', 'Le mont Blanc', 'Le Kilimandjaro']),
  ('geography-04', 'geography', 2, 'Quel est le plus long fleuve de France ?', 'La Loire', array['La Seine', 'Le Rhône', 'La Garonne']),
  ('geography-05', 'geography', 2, 'Quelle est la capitale de l’Australie ?', 'Canberra', array['Sydney', 'Melbourne', 'Perth']),
  ('geography-06', 'geography', 2, 'Quelle est la capitale du Canada ?', 'Ottawa', array['Toronto', 'Montréal', 'Vancouver']),
  ('geography-07', 'geography', 2, 'Quel est le plus petit pays du monde par sa superficie ?', 'Le Vatican', array['Monaco', 'Saint-Marin', 'Le Liechtenstein']),
  ('geography-08', 'geography', 3, 'Combien de pays ont une frontière terrestre avec la France métropolitaine ?', '8', array['6', '7', '9']),
  ('geography-09', 'geography', 3, 'Quel pays compte le plus de fuseaux horaires, territoires d’outre-mer compris ?', 'La France', array['La Russie', 'Les États-Unis', 'Le Royaume-Uni']),
  ('geography-10', 'geography', 3, 'Quelle est la capitale de la Mongolie ?', 'Oulan-Bator', array['Astana', 'Bichkek', 'Tachkent']),
  ('science-01', 'science', 1, 'Quelle planète est surnommée la planète rouge ?', 'Mars', array['Vénus', 'Jupiter', 'Mercure']),
  ('science-02', 'science', 1, 'Quelle est la formule chimique de l’eau ?', 'H2O', array['CO2', 'O2', 'H2O2']),
  ('science-03', 'science', 1, 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', 'Le dioxyde de carbone', array['L’oxygène', 'L’azote', 'L’hydrogène']),
  ('science-04', 'science', 2, 'Quel est le symbole chimique de l’or ?', 'Au', array['Ag', 'Or', 'Go']),
  ('science-05', 'science', 2, 'Combien d’os compte le squelette d’un adulte ?', '206', array['186', '212', '230']),
  ('science-06', 'science', 2, 'Quelle est la plus grande planète du système solaire ?', 'Jupiter', array['Saturne', 'Neptune', 'Uranus']),
  ('science-07', 'science', 2, 'Qui a formulé la théorie de la relativité générale ?', 'Albert Einstein', array['Isaac Newton', 'Niels Bohr', 'Max Planck']),
  ('science-08', 'science', 3, 'Quelle est la vitesse approximative de la lumière dans le vide ?', '300 000 km/s', array['30 000 km/s', '150 000 km/s', '1 000 000 km/s']),
  ('science-09', 'science', 3, 'Quel est l’élément chimique le plus abondant dans l’Univers ?', 'L’hydrogène', array['L’hélium', 'L’oxygène', 'Le carbone']),
  ('science-10', 'science', 3, 'Combien de chromosomes possède une cellule humaine ordinaire ?', '46', array['23', '44', '48']),
  ('cinema-01', 'cinema', 1, 'Qui a réalisé « Jurassic Park » (1993) ?', 'Steven Spielberg', array['James Cameron', 'George Lucas', 'Ridley Scott']),
  ('cinema-02', 'cinema', 1, 'Dans quel film Disney trouve-t-on Simba ?', 'Le Roi lion', array['Bambi', 'Tarzan', 'Le Livre de la jungle']),
  ('cinema-03', 'cinema', 1, 'Qui interprète Jack Sparrow dans « Pirates des Caraïbes » ?', 'Johnny Depp', array['Orlando Bloom', 'Brad Pitt', 'Leonardo DiCaprio']),
  ('cinema-04', 'cinema', 1, 'Quel robot doré accompagne R2-D2 dans « Star Wars » ?', 'C-3PO', array['BB-8', 'K-2SO', 'WALL-E']),
  ('cinema-05', 'cinema', 2, 'Quel film a reçu l’Oscar du meilleur film lors de la cérémonie de 1998 ?', 'Titanic', array['Will Hunting', 'L.A. Confidential', 'Pour le pire et pour le meilleur']),
  ('cinema-06', 'cinema', 2, 'Dans « Le Seigneur des anneaux », quel hobbit est chargé de détruire l’Anneau ?', 'Frodon', array['Sam', 'Merry', 'Pippin']),
  ('cinema-07', 'cinema', 2, 'Quel studio a produit « Toy Story », premier long métrage entièrement en images de synthèse ?', 'Pixar', array['DreamWorks', 'Blue Sky', 'Illumination']),
  ('cinema-08', 'cinema', 3, 'Qui a réalisé « Le Fabuleux Destin d’Amélie Poulain » ?', 'Jean-Pierre Jeunet', array['Luc Besson', 'Jacques Audiard', 'Michel Gondry']),
  ('cinema-09', 'cinema', 3, 'En quelle année est sorti le premier film « Star Wars » ?', '1977', array['1975', '1980', '1983']),
  ('cinema-10', 'cinema', 3, 'Quel film de Bong Joon-ho a remporté la Palme d’or en 2019 ?', 'Parasite', array['Memories of Murder', 'The Host', 'Okja']),
  ('video_games-01', 'video_games', 1, 'Quel plombier en salopette rouge est la mascotte de Nintendo ?', 'Mario', array['Luigi', 'Wario', 'Toad']),
  ('video_games-02', 'video_games', 1, 'Dans quel jeu de Mojang construit-on un monde fait de blocs ?', 'Minecraft', array['Roblox', 'Terraria', 'Fortnite']),
  ('video_games-03', 'video_games', 1, 'Comment s’appelle le hérisson bleu de Sega ?', 'Sonic', array['Knuckles', 'Tails', 'Shadow']),
  ('video_games-04', 'video_games', 2, 'Comment s’appelle le héros de la série « The Legend of Zelda » ?', 'Link', array['Zelda', 'Ganon', 'Epona']),
  ('video_games-05', 'video_games', 2, 'Quelle entreprise a créé la PlayStation ?', 'Sony', array['Nintendo', 'Sega', 'Microsoft']),
  ('video_games-06', 'video_games', 2, 'Quel Pokémon porte le numéro 25 du Pokédex national ?', 'Pikachu', array['Bulbizarre', 'Évoli', 'Rondoudou']),
  ('video_games-07', 'video_games', 2, 'En quelle année est sortie la Nintendo Switch ?', '2017', array['2015', '2019', '2012']),
  ('video_games-08', 'video_games', 3, 'En quelle année est sorti « Pong » d’Atari ?', '1972', array['1968', '1978', '1981']),
  ('video_games-09', 'video_games', 3, 'Quel éditeur français est à l’origine de la série « Rayman » ?', 'Ubisoft', array['Quantic Dream', 'Arkane', 'Dontnod']),
  ('video_games-10', 'video_games', 3, 'Quel créateur japonais a imaginé Mario et Zelda ?', 'Shigeru Miyamoto', array['Hideo Kojima', 'Satoru Iwata', 'Hironobu Sakaguchi']),
  ('sport-01', 'sport', 1, 'Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?', '11', array['10', '9', '12']),
  ('sport-02', 'sport', 1, 'Dans quel sport utilise-t-on un volant ?', 'Le badminton', array['Le tennis', 'Le squash', 'Le padel']),
  ('sport-03', 'sport', 1, 'Combien de joueurs une équipe de basket-ball aligne-t-elle sur le terrain ?', '5', array['6', '7', '4']),
  ('sport-04', 'sport', 2, 'Quel pays a remporté la Coupe du monde de football 2018 ?', 'La France', array['La Croatie', 'La Belgique', 'L’Allemagne']),
  ('sport-05', 'sport', 2, 'Combien de points vaut un essai transformé au rugby à XV ?', '7', array['5', '6', '8']),
  ('sport-06', 'sport', 2, 'Quel joueur détient le record de victoires à Roland-Garros ?', 'Rafael Nadal', array['Novak Djokovic', 'Roger Federer', 'Björn Borg']),
  ('sport-07', 'sport', 2, 'Quelle ville a accueilli les Jeux olympiques d’été de 2016 ?', 'Rio de Janeiro', array['Londres', 'Tokyo', 'Pékin']),
  ('sport-08', 'sport', 3, 'Quelle est la distance officielle d’un marathon ?', '42,195 km', array['40 km', '42 km', '45,5 km']),
  ('sport-09', 'sport', 3, 'Au golf, comment appelle-t-on un trou joué en deux coups sous le par ?', 'Un eagle', array['Un birdie', 'Un albatros', 'Un bogey']),
  ('sport-10', 'sport', 3, 'Combien de joueurs compte une équipe de volley-ball sur le terrain ?', '6', array['5', '7', '8']),
  ('technology-01', 'technology', 1, 'Quelle entreprise fabrique l’iPhone ?', 'Apple', array['Samsung', 'Google', 'Huawei']),
  ('technology-02', 'technology', 1, 'Sur quelle base repose le système binaire ?', '2', array['8', '10', '16']),
  ('technology-03', 'technology', 1, 'Que désigne l’acronyme « CPU » ?', 'Le processeur', array['La carte graphique', 'La mémoire vive', 'Le disque dur']),
  ('technology-04', 'technology', 2, 'Combien de bits contient un octet ?', '8', array['4', '16', '10']),
  ('technology-05', 'technology', 2, 'Que signifie « HTML » ?', 'HyperText Markup Language', array['High Tech Modern Language', 'HyperText Machine Language', 'Home Tool Markup Language']),
  ('technology-06', 'technology', 2, 'Qui a cofondé Microsoft avec Paul Allen ?', 'Bill Gates', array['Steve Jobs', 'Steve Wozniak', 'Larry Page']),
  ('technology-07', 'technology', 3, 'En quelle année le premier iPhone a-t-il été présenté ?', '2007', array['2005', '2008', '2010']),
  ('technology-08', 'technology', 3, 'Quel langage de programmation a été créé par Guido van Rossum ?', 'Python', array['Ruby', 'Java', 'Perl']),
  ('technology-09', 'technology', 3, 'Quel scientifique britannique a inventé le World Wide Web ?', 'Tim Berners-Lee', array['Alan Turing', 'Vint Cerf', 'Charles Babbage']),
  ('technology-10', 'technology', 3, 'Quel mathématicien britannique a décrit en 1936 la « machine » qui porte son nom ?', 'Alan Turing', array['Charles Babbage', 'John von Neumann', 'Claude Shannon']),
  ('music-01', 'music', 1, 'Combien de cordes possède une guitare classique ?', '6', array['4', '5', '7']),
  ('music-02', 'music', 1, 'Dans quel groupe jouaient John Lennon et Paul McCartney ?', 'Les Beatles', array['Les Rolling Stones', 'Queen', 'The Who']),
  ('music-03', 'music', 1, 'Quel chanteur était surnommé le « King of Pop » ?', 'Michael Jackson', array['Prince', 'Elvis Presley', 'Stevie Wonder']),
  ('music-04', 'music', 2, 'Qui a composé la Symphonie n° 9 et son « Ode à la joie » ?', 'Ludwig van Beethoven', array['Wolfgang Amadeus Mozart', 'Jean-Sébastien Bach', 'Joseph Haydn']),
  ('music-05', 'music', 2, 'Qui chante « La Vie en rose » (1947) ?', 'Édith Piaf', array['Dalida', 'Barbara', 'Juliette Gréco']),
  ('music-06', 'music', 2, 'Combien de touches compte un piano standard ?', '88', array['76', '82', '92']),
  ('music-07', 'music', 2, 'De quel pays vient le groupe ABBA ?', 'La Suède', array['La Norvège', 'Le Danemark', 'La Finlande']),
  ('music-08', 'music', 3, 'Quel duo français a publié l’album « Random Access Memories » ?', 'Daft Punk', array['Justice', 'Air', 'Cassius']),
  ('music-09', 'music', 3, 'Qui a composé « Les Quatre Saisons » ?', 'Antonio Vivaldi', array['Jean-Sébastien Bach', 'Georg Friedrich Haendel', 'Arcangelo Corelli']),
  ('music-10', 'music', 3, 'De quel instrument jouait principalement Miles Davis ?', 'La trompette', array['Le saxophone', 'Le trombone', 'Le piano']);

-- Draws the questions of a match: random within the category, ordered by
-- difficulty so the game gets harder as it goes.
create or replace function app_private.quiz_start_data(p_settings jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with params as (
    select greatest(1, least(20, coalesce((p_settings ->> 'questions')::integer, 8))) as total,
           coalesce(nullif(p_settings ->> 'category', ''), 'mixed') as category
  ),
  picked as (
    select q.*
      from app_private.quiz_questions q, params p
     where q.active and (p.category = 'mixed' or q.category = p.category)
     order by random()
     limit (select total from params)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'category', category, 'difficulty', difficulty,
           'prompt', prompt, 'answer', answer, 'wrong', to_jsonb(wrong))
         order by difficulty, random()), '[]'::jsonb)
    from picked;
$$;
revoke all on function app_private.quiz_start_data(jsonb) from public, anon, authenticated;

update public.game_catalog
   set tagline = 'Le quiz multijoueur le plus rapide.',
       description = 'Questions chronométrées dans neuf catégories, réponses simultanées validées par le serveur, '
                     'points pour la rapidité, la difficulté et les séries. De 2 à 8 joueurs.',
       min_players = 2,
       max_players = 8,
       avg_duration_minutes = 5,
       modes = '[{"id":"duel","name":"Duel","ranked":true},{"id":"party","name":"Party","ranked":false}]',
       availability = 'available',
       network_model = 'turn_based_engine',
       rules = '{"settings":{"questions":{"options":[5,8,10],"default":8},"question_seconds":{"options":[10,15,20],"default":15},'
               '"category":{"options":["mixed","general", "history", "geography", "science", "cinema", "video_games", "sport", "technology", "music"],"default":"mixed"}}}',
       sort_order = 20,
       released_at = now()
 where id = 'quiz_rush';

insert into public.game_catalog
  (id, name, tagline, description, category, min_players, max_players, avg_duration_minutes,
   modes, availability, network_model, rules, sort_order, released_at)
values
  ('mental_math', 'Calcul Express', 'Le calcul mental, en version course.',
   'Additions, tables et opérations mixtes de plus en plus difficiles, générées par le serveur. '
   'Le plus rapide et le plus juste l’emporte. De 2 à 8 joueurs.',
   'trivia', 2, 8, 3,
   '[{"id":"duel","name":"Duel","ranked":true},{"id":"party","name":"Party","ranked":false}]',
   'available', 'turn_based_engine',
   '{"settings":{"questions":{"options":[10,15,20],"default":10},"question_seconds":{"options":[8,10,15],"default":10}}}',
   21, now())
on conflict (id) do nothing;
