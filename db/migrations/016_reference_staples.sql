/*
 * The everyday rows of MEXT's food table, each with a plain name
 * (healthspec.md §5.8, *Staples*). A search shows these first and keeps the
 * table's other 2,305 rows behind "Show more": typing "egg" offers a
 * hen's egg, not every bird and every way of drying one. Chosen and named
 * by hand, with the table's own name beside each; add to it with a new
 * migration.
 *
 * Kept apart from `reference_foods`, like `reference_names`, so it does not
 * depend on the seed having run.
 */
create table if not exists reference_staples (
  food_number text primary key,
  -- What we call it: shown in the search, searched, and the name of the food made from the row.
  name        text not null
);

insert into reference_staples (food_number, name) values
  ('01004', 'Oatmeal, dry'), -- Common oats, oatmeal, raw
  ('01015', 'Flour, plain'), -- Common wheat, soft flour, first grade
  ('01026', 'White bread (shokupan)'), -- Common wheat, bread, white
  ('01031', 'French bread'), -- Common wheat, bread, French bread
  ('01035', 'Croissant'), -- Common wheat, bread, croissants
  ('01036', 'English muffin'), -- Common wheat, bread, English muffins
  ('01148', 'Bagel'), -- Common wheat, bread, bagel
  ('01038', 'Udon, fresh, uncooked'), -- Common wheat, "Udon" (thick wheat noodles), uncooked
  ('01039', 'Udon, boiled'), -- Common wheat, "Udon" (thick wheat noodles), boiled
  ('01043', 'Somen, dry'), -- Common wheat, "Somen and Hiyamugi" (thin wheat noodles), dried noodles, uncooked
  ('01044', 'Somen, boiled'), -- Common wheat, "Somen and Hiyamugi" (thin wheat noodles), dried noodles, boiled
  ('01063', 'Pasta, dry'), -- Durum wheat, macaroni and spaghetti, dry pasta, uncooked
  ('01064', 'Pasta, boiled'), -- Durum wheat, macaroni and spaghetti, dry pasta, boiled
  ('01083', 'White rice, dry'), -- Rice, paddy rice, non-glutinous, well-milled, raw
  ('01088', 'White rice, cooked'), -- Rice, short grain, paddy rice, nonglutinous rice, well-milled, "meshi" (cooked rice)
  ('01080', 'Brown rice, dry'), -- Rice, paddy rice, brown rice, raw
  ('01085', 'Brown rice, cooked'), -- Rice, short grain, paddy rice, brown, "meshi" (cooked rice)
  ('01117', 'Mochi (rice cake)'), -- Rice, glutinous rice products, rice cake
  ('01127', 'Soba, fresh, uncooked'), -- Buckwheat, fresh noodles, uncooked
  ('01128', 'Soba, fresh, boiled'), -- Buckwheat, fresh noodles, boiled
  ('01129', 'Soba, dry'), -- Buckwheat, dried noodles, uncooked
  ('01130', 'Soba, dry, boiled'), -- Buckwheat, dried noodles, boiled
  ('01187', 'Ramen noodles, semi-dried'), -- Chinese noodles (ramen), semi-dried
  ('01188', 'Yakisoba noodles, steamed'), -- Chinese noodles, steamed, sauteed (yakisoba noodles)
  ('02006', 'Sweet potato, peeled, raw'), -- Sweet potato, tuberous root, without skin, raw
  ('02007', 'Sweet potato, peeled, steamed'), -- Sweet potato, tuberous root, without skin, steamed
  ('02008', 'Sweet potato, peeled, baked'), -- Sweet potato, tuberous root, without skin, baked
  ('02045', 'Sweet potato, with skin, raw'), -- Sweet potato, tuberous root, with skin, raw
  ('02017', 'Potato, peeled, raw'), -- Potatoes, tuber, raw
  ('02019', 'Potato, peeled, boiled'), -- Potatoes, tuber, boiled
  ('02063', 'Potato, with skin, raw'), -- Potato, tuber, with skin, raw
  ('02003', 'Konjac block'), -- Konjac, block, made from fine powder
  ('02005', 'Konjac noodles (shirataki)'), -- Konjac, noodles
  ('03003', 'Sugar, white (johakuto)'), -- Sugars, soft sugars, white
  ('03005', 'Sugar, granulated'), -- Sugars, hard sugars, granulated
  ('03022', 'Honey'), -- Honey
  ('04002', 'Adzuki beans, boiled'), -- Adzuki beans, mature seeds, whole, boiled
  ('04024', 'Soybeans, boiled'), -- Soybeans, mature seeds, whole, domestic, yellow seed coats, boiled
  ('04029', 'Kinako'), -- Soybeans, "Kinako" (roasted and ground beans), made from whole beans with yellow seed coats
  ('04032', 'Tofu, firm (momen)'), -- Soybeans, tofu, "Momen-tofu" (regular tofu)
  ('04033', 'Tofu, silken (kinugoshi)'), -- Soybeans, tofu, "Kinugoshi-tofu" (silken tofu)
  ('04039', 'Thick fried tofu (atsuage)'), -- Soybeans, tofu, "Nama-age" (fried slices of drained tofu)
  ('04040', 'Fried tofu (abura-age)'), -- Soybeans, tofu, "Abura-age" (fried thin slices of pressed tofu), uncooked
  ('04046', 'Natto'), -- Soybeans, natto, "Itohiki-natto" (fermented whole soybean)
  ('04047', 'Natto, chopped (hikiwari)'), -- Soybeans, natto, "Hikiwari-natto" (fermented dehulled and split soybean)
  ('04052', 'Soy milk, unsweetened'), -- Soybeans, soy milk, regular
  ('04066', 'Chickpeas, boiled'), -- Chickpeas, mature seeds, whole, boiled
  ('05001', 'Almonds, raw'), -- Almonds, raw
  ('05040', 'Almonds, roasted, unsalted'), -- Almonds, roasted, without salt
  ('05005', 'Cashews, roasted, salted'), -- Cashew nuts, oil-roasted and salted
  ('05014', 'Walnuts, roasted'), -- Walnuts, roasted
  ('05018', 'Sesame seeds, roasted'), -- Sesame seeds, whole, dried and roasted
  ('05026', 'Pistachios, roasted, salted'), -- Pistachio nuts, roasted and salted
  ('05031', 'Macadamia nuts, roasted, salted'), -- Macadamia nuts, roasted and salted
  ('05035', 'Peanuts, roasted'), -- Peanuts, mature seeds, Virginia type, roasted
  ('05037', 'Peanut butter'), -- Peanuts, peanut butter
  ('06007', 'Asparagus, raw'), -- Asparagus, green, shoots, raw
  ('06015', 'Edamame, raw'), -- Soybeans, immature, raw
  ('06016', 'Edamame, boiled'), -- Soybeans, immature, boiled
  ('06017', 'Edamame, frozen'), -- Soybeans, immature, frozen
  ('06022', 'Snap peas, raw'), -- Peas, snap peas, immature pods, raw
  ('06032', 'Okra, raw'), -- Okra, pods, raw
  ('06048', 'Kabocha squash, raw'), -- Pumpkin and squash, winter squash, fruit, raw
  ('06054', 'Cauliflower, raw'), -- Cauliflower, inflorescence, raw
  ('06061', 'Cabbage, raw'), -- Cabbage, common, head, raw
  ('06065', 'Cucumber, raw'), -- Cucumber, fruit, raw
  ('06072', 'Mizuna, raw'), -- Leaf green, "Mizuna", leaves, raw
  ('06084', 'Burdock root (gobo), raw'), -- Edible burdock, root, raw
  ('06086', 'Komatsuna, raw'), -- Spinach mustard, "Komatsuna", leaves, raw
  ('06103', 'Ginger, raw'), -- Ginger, mature rhizome, raw
  ('06116', 'Zucchini, raw'), -- Zucchini, fruit, raw
  ('06119', 'Celery, raw'), -- Celery, petiole, raw
  ('06132', 'Daikon, with skin, raw'), -- Japanese radishes, Daikon, root with skin, raw
  ('06134', 'Daikon, peeled, raw'), -- Japanese radishes, Daikon, root without skin, raw
  ('06153', 'Onion, raw'), -- Onions, bulb, raw
  ('06175', 'Sweet corn, raw'), -- Corn, sweet corn, immature kernels, raw
  ('06176', 'Sweet corn, boiled'), -- Corn, sweet corn, immature kernels, boiled
  ('06178', 'Sweet corn kernels, frozen'), -- Corn, sweet corn, immature kernels, frozen
  ('06182', 'Tomato, raw'), -- Tomatoes, fruit, raw
  ('06183', 'Cherry tomatoes, raw'), -- Tomatoes, cherry tomatoes, fruit, raw
  ('06191', 'Eggplant, raw'), -- Eggplant, Japanese type, fruit, raw
  ('06207', 'Chinese chives (nira), raw'), -- Chinese chive, leaves, raw
  ('06212', 'Carrot, with skin, raw'), -- Carrot, regular (European type), root with skin, raw
  ('06214', 'Carrot, peeled, raw'), -- Carrot, regular (European type), root without skin, raw
  ('06223', 'Garlic, raw'), -- Garlic, bulb, raw
  ('06226', 'Long onion (naganegi), raw'), -- Welsh onions, "Nebuka-negi" (large variety, blanching cultivation), leaves, raw
  ('06227', 'Green onion (ha-negi), raw'), -- Welsh onions, "Ha-negi" (large variety, green), leaves, raw
  ('06233', 'Chinese cabbage (hakusai), raw'), -- Chinese cabbage, head, raw
  ('06236', 'Kimchi'), -- Chinese cabbage, head, pickles, Kimchi
  ('06245', 'Green pepper (piman), raw'), -- Sweet peppers, fruit, green, raw
  ('06247', 'Red bell pepper, raw'), -- Sweet peppers, fruit, red, raw
  ('06249', 'Yellow bell pepper, raw'), -- Sweet peppers, fruit, yellow, raw
  ('06263', 'Broccoli, raw'), -- Broccoli, inflorescence, raw
  ('06267', 'Spinach, raw'), -- Spinach, leaves, all season, raw
  ('06269', 'Spinach, frozen'), -- Spinach, leaves, frozen
  ('06287', 'Soybean sprouts, raw'), -- Bean sprouts, soybean sprouts, raw
  ('06291', 'Bean sprouts (moyashi), raw'), -- Bean sprouts, mung bean sprouts, raw
  ('06312', 'Lettuce, raw'), -- Lettuce, head lettuce, crisp type, soil culture, head, raw
  ('06314', 'Leaf lettuce, raw'), -- Lettuce, green leaf lettuce, leaves, raw
  ('06317', 'Lotus root, raw'), -- East Indian lotus root, rhizome, raw
  ('07006', 'Avocado'), -- Avocados, raw
  ('07012', 'Strawberries'), -- Strawberries, raw
  ('07027', 'Mandarin (mikan)'), -- Satsuma mandarins, segments, normal ripening type, raw
  ('07040', 'Orange, navel'), -- Oranges, navel, juice sacs, raw
  ('07041', 'Orange, Valencia'), -- Oranges, Valencia, imported from the U.S.A., juice sacs, raw
  ('07049', 'Persimmon'), -- Japanese persimmons, nonastringent, raw
  ('07054', 'Kiwi, green'), -- Kiwifruit, green flesh type, raw
  ('07062', 'Grapefruit'), -- Grapefruit, white flesh type, juice sacs, raw
  ('07070', 'Cherries'), -- Sweet cherries, domestic, raw
  ('07077', 'Watermelon'), -- Watermelon, red flesh type, raw
  ('07088', 'Pear (nashi)'), -- Pears, sand pears, raw
  ('07096', 'Dates, dried'), -- Dates, dried
  ('07097', 'Pineapple'), -- Pineapple, raw
  ('07107', 'Banana'), -- Bananas, raw
  ('07116', 'Grapes, peeled'), -- Grapes, raw
  ('07117', 'Raisins'), -- Grapes, raisins
  ('07124', 'Blueberries'), -- Blueberries, raw
  ('07132', 'Mango'), -- Mangoes, raw
  ('07134', 'Melon'), -- Muskmelon, greenhouse culture, raw
  ('07136', 'Peach'), -- Peaches, raw
  ('07148', 'Apple, peeled'), -- Apples, without skin, raw
  ('07155', 'Lemon, whole'), -- Lemons, whole, raw
  ('07168', 'Kiwi, gold'), -- Kiwifruit, yellow flesh type, raw
  ('07176', 'Apple, with skin'), -- Apples, with skin, raw
  ('08001', 'Enoki mushrooms, raw'), -- Mushrooms, winter mushrooms, raw
  ('08016', 'Shimeji mushrooms, raw'), -- Mushrooms, beech mushrooms, raw
  ('08020', 'Nameko mushrooms, raw'), -- Mushrooms, "Nameko", raw
  ('08025', 'Eringi mushrooms, raw'), -- Mushrooms, king oyster mushrooms, raw
  ('08028', 'Maitake mushrooms, raw'), -- Mushrooms, "Maitake", raw
  ('08031', 'Button mushrooms, raw'), -- Mushrooms, button mushrooms, fresh, raw
  ('08039', 'Shiitake mushrooms, raw'), -- Mushrooms, "Shiitake", bed-log cultivation, fresh, raw
  ('09039', 'Wakame, raw'), -- Algae, "Wakame", raw
  ('10003', 'Horse mackerel (aji), raw'), -- Fish, horse mackerel, Japanese Jack mackerel＊, with integument, raw
  ('10047', 'Sardine (iwashi), raw'), -- Fish, sardine, Japanese pilchard, raw
  ('10055', 'Shirasu, dried (shirasuboshi)'), -- Fish, sardine, "Shirasuboshi" (boiled and dried whitebait), mild dried
  ('10067', 'Eel (unagi), raw'), -- Fish, eel, cultured, raw
  ('10085', 'Swordfish, raw'), -- Fish, swordfish, raw
  ('10086', 'Bonito (katsuo), spring, raw'), -- Fish, skipjack tuna, caught in spring, raw
  ('10130', 'Salmon, coho, farmed, raw'), -- Fish, salmon and trout, Coho salmon, cultured, raw
  ('10134', 'Salmon, chum, raw'), -- Fish, salmon and trout, chum salmon, raw
  ('10139', 'Salted salmon (shiozake), raw'), -- Fish, salmon and trout, chum salmon, "Shiozake" (salted salmon), raw
  ('10140', 'Salmon roe (ikura)'), -- Fish, salmon and trout, chum salmon, "Ikura" (salted roe)
  ('10144', 'Salmon, Atlantic, farmed, raw'), -- Fish, salmon and trout, Atlantic salmon, cultured, raw
  ('10146', 'Trout salmon, farmed, raw'), -- Fish, salmon and trout, rainbow trout, cultured in the sea, with integument, raw
  ('10154', 'Mackerel (saba), raw'), -- Fish, mackerel, chub mackerel, raw
  ('10164', 'Mackerel, canned in brine'), -- Fish, mackerel, canned products, boiled in brine
  ('10165', 'Mackerel, canned in miso'), -- Fish, mackerel, canned products, boiled with miso
  ('10173', 'Pacific saury (sanma), raw'), -- Fish, Pacific saury, with integument, raw
  ('10193', 'Sea bream (tai), farmed, raw'), -- Fish, sea bream, red sea bream, cultured, with integument, raw
  ('10202', 'Cod roe (tarako), raw'), -- Fish, cod, walleye pollock, "Tarako" (salted roe), raw
  ('10204', 'Mentaiko'), -- Fish, cod, walleye pollock, "Karashi-mentaiko" (salted roe with red hot pepper powder)
  ('10205', 'Cod, raw'), -- Fish, cod, Pacific cod, raw
  ('10241', 'Yellowtail (buri), raw'), -- Fish, yellowtail, mature, raw
  ('10243', 'Yellowtail, young (hamachi), farmed, raw'), -- Fish, yellowtail, young, cultured, with integument, raw
  ('10252', 'Tuna, yellowfin, raw'), -- Fish, tuna, yellowfin tuna, raw
  ('10253', 'Tuna, bluefin, lean (akami), raw'), -- Fish, tuna, bluefin tuna, lean meat, raw
  ('10254', 'Tuna, bluefin, fatty (toro), raw'), -- Fish, tuna, bluefin tuna, fatty meat, raw
  ('10260', 'Tuna, canned in brine'), -- Fish, tuna, canned products, flaked light meat in brine
  ('10263', 'Tuna, canned in oil'), -- Fish, tuna, canned products, flaked light meat in oil
  ('10281', 'Clams (asari), raw'), -- Mollusks, short-necked clam, raw
  ('10292', 'Oysters, raw'), -- Mollusks, Pacific oyster, cultured, raw
  ('10313', 'Scallops, raw'), -- Mollusks, giant ezo-scallop, adductor muscle, raw
  ('10329', 'Prawns, black tiger, raw'), -- Crustacean, giant tiger prawn, cultured, raw
  ('10345', 'Squid, raw'), -- Mollusks, Japanese common squid, raw
  ('10361', 'Octopus, raw'), -- Mollusks, common octopus, raw
  ('10376', 'Crab sticks (kanikama)'), -- Surimi products, "Kanifumi-kamaboko" (imitation crab meat made from surimi)
  ('10379', 'Kamaboko'), -- Surimi products, "Mushi-kamaboko" (steamed kamaboko)
  ('10381', 'Chikuwa'), -- Surimi products, "Yaki-chikuwa" (baked tubular kamaboko)
  ('10415', 'Shrimp, whiteleg, raw'), -- Crustacean, whiteleg shrimp, raw
  ('10425', 'Tuna, bigeye, lean (akami), raw'), -- Bigeye tuna (mebachi), lean (akami), raw
  ('10445', 'Shirasu, boiled (kamaage)'), -- Shirasu (whitebait), boiled (kamaage)
  ('11034', 'Beef, domestic, chuck roll, raw'), -- Beef, dairy fattened steer, chuck roll, lean and fat, raw
  ('11043', 'Beef, domestic, sirloin, raw'), -- Beef, dairy fattened steer, sirloin, lean and fat, raw
  ('11046', 'Beef, domestic, belly (bara), raw'), -- Beef, dairy fattened steer, flank or short plate, lean and fat, raw
  ('11047', 'Beef, domestic, round (momo), raw'), -- Beef, dairy fattened steer, inside round, lean and fat, raw
  ('11060', 'Beef, imported, chuck, raw'), -- Beef, imported beef, chuck, lean and fat, raw
  ('11064', 'Beef, imported, chuck roll, raw'), -- Beef, imported beef, chuck roll, lean and fat, raw
  ('11067', 'Beef, imported, rib loin, raw'), -- Beef, imported beef, rib loin, lean and fat, raw
  ('11071', 'Beef, imported, sirloin, raw'), -- Beef, imported beef, sirloin, lean and fat, raw
  ('11074', 'Beef, imported, belly (bara), raw'), -- Beef, imported beef, flank or short plate, lean and fat, raw
  ('11075', 'Beef, imported, round (momo), raw'), -- Beef, imported beef, inside round, lean and fat, raw
  ('11085', 'Beef, imported, fillet, raw'), -- Beef, imported beef, fillet, lean, raw
  ('11089', 'Ground beef, raw'), -- Beef, ground meat, raw
  ('11104', 'Roast beef'), -- Beef products, roast beef
  ('11115', 'Pork shoulder, raw'), -- Pork, large type breed, picnic shoulder, lean and fat, raw
  ('11119', 'Pork shoulder loin (kata-rosu), raw'), -- Pork, large type breed, Boston butt, lean and fat, raw
  ('11123', 'Pork loin, raw'), -- Pork, large type breed, loin, lean and fat, raw
  ('11129', 'Pork belly, raw'), -- Pork, large type breed, belly, lean and fat, raw
  ('11130', 'Pork leg (momo), raw'), -- Pork, large type breed, inside ham, lean and fat, raw
  ('11140', 'Pork fillet, raw'), -- Pork, large type breed, fillet, lean, raw
  ('11163', 'Ground pork, raw'), -- Pork, ground meat, raw
  ('11176', 'Ham, loin'), -- Pork, ham, loin
  ('11183', 'Bacon'), -- Pork, bacon
  ('11186', 'Wiener sausage'), -- Pork, sausage, Vienna
  ('11195', 'Roast pork (chashu)'), -- Pork, roast pork
  ('11218', 'Chicken wing, with skin, raw'), -- Chicken, broiler, wing, meat with skin, raw
  ('11219', 'Chicken breast, with skin, raw'), -- Chicken, broiler, breast, meat with skin, raw
  ('11220', 'Chicken breast, skinless, raw'), -- Chicken, broiler, breast, meat without skin, raw
  ('11221', 'Chicken thigh, with skin, raw'), -- Chicken, broiler, thigh, meat with skin, raw
  ('11224', 'Chicken thigh, skinless, raw'), -- Chicken, broiler, thigh, meat without skin, raw
  ('11227', 'Chicken tender (sasami), raw'), -- Chicken, broiler, tender, raw
  ('11230', 'Ground chicken, raw'), -- Chicken, ground meat, raw
  ('11232', 'Chicken liver, raw'), -- Chicken, offal and by-products, liver, raw
  ('11286', 'Chicken drumette, with skin, raw'), -- Chicken, broiler, wing stick, meat with skin, raw
  ('12002', 'Quail egg, raw'), -- Eggs, Japanese quail, whole, raw
  ('12004', 'Egg, raw'), -- Eggs, hen, whole, raw
  ('12005', 'Egg, boiled'), -- Eggs, hen, whole, boiled
  ('12010', 'Egg yolk, raw'), -- Eggs, hen, yolk, raw
  ('12014', 'Egg white, raw'), -- Eggs, hen, white, raw
  ('13003', 'Milk, whole'), -- Liquid milk, whole milk
  ('13005', 'Milk, low fat'), -- Liquid milk, containing recombined milk, low fat
  ('13006', 'Milk, skimmed'), -- Liquid milk, skimmed milk
  ('13014', 'Cream'), -- Cream, milk fat
  ('13025', 'Yogurt, plain, whole milk'), -- Yogurt, whole milk, unsweetened
  ('13033', 'Cottage cheese'), -- Cheese, cottage
  ('13034', 'Camembert'), -- Cheese, Camembert
  ('13035', 'Cream cheese'), -- Cheese, cream
  ('13037', 'Cheddar'), -- Cheese, Cheddar
  ('13038', 'Parmesan'), -- Cheese, Parmesan
  ('13040', 'Processed cheese'), -- Cheeses, processed
  ('13053', 'Yogurt, plain, low fat'), -- Yogurt, low fat, unsweetened
  ('13054', 'Yogurt, plain, fat free'), -- Yogurt, fat free, unsweetened
  ('13056', 'Mozzarella'), -- Cheese, mozzarella
  ('14001', 'Olive oil'), -- Olive oil
  ('14002', 'Sesame oil'), -- Sesame oil
  ('14006', 'Vegetable oil'), -- Vegetable oil, blend
  ('14008', 'Canola oil'), -- Rapeseed oil
  ('14017', 'Butter, salted'), -- Butter, salted butter
  ('14018', 'Butter, unsalted'), -- Butter, unsalted butter
  ('17007', 'Soy sauce'), -- Soy sauce, "Koikuchi-shoyu" (common soy sauce)
  ('17036', 'Ketchup'), -- Tomato products, ketchup
  ('17042', 'Mayonnaise'), -- Dressing, mayonnaise, whole egg type
  ('17045', 'Miso') -- Miso, rice-koji miso, light yellow type
on conflict (food_number) do update set name = excluded.name;
