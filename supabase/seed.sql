-- 初期カテゴリ（設計書 2.4）。お題はバッチで生成する
insert into public.categories (slug, name, sort_order) values
  ('animals',     '動物',     10),
  ('foods',       '食べ物',   20),
  ('occupations', '職業',     30),
  ('sports',      'スポーツ', 40),
  ('vehicles',    '乗り物',   50);

-- ローカル開発・E2E 用の固定お題（本番には db push で入らない）
insert into public.topics (category_id, text, text_normalized, generated_by)
select c.id, t.text, t.normalized, 'manual'
from (values
  ('animals', 'キリン', 'きりん'), ('animals', 'ゾウ', 'ぞう'), ('animals', 'ペンギン', 'ぺんぎん'),
  ('animals', 'カンガルー', 'かんがるー'), ('animals', 'ゴリラ', 'ごりら'), ('animals', 'ウサギ', 'うさぎ'),
  ('animals', 'ライオン', 'らいおん'), ('animals', 'ヘビ', 'へび'),
  ('foods', 'ラーメン', 'らーめん'), ('foods', 'すし', 'すし'), ('foods', 'カレーライス', 'かれーらいす'),
  ('foods', 'たこ焼き', 'たこ焼き'), ('foods', 'ソフトクリーム', 'そふとくりーむ'),
  ('occupations', '消防士', '消防士'), ('occupations', '美容師', '美容師'), ('occupations', 'パイロット', 'ぱいろっと'),
  ('occupations', '料理人', '料理人'), ('occupations', '医者', '医者'),
  ('sports', 'サッカー', 'さっかー'), ('sports', '水泳', '水泳'), ('sports', 'ボウリング', 'ぼうりんぐ'),
  ('sports', 'スキー', 'すきー'), ('sports', '柔道', '柔道'),
  ('vehicles', '新幹線', '新幹線'), ('vehicles', '自転車', '自転車'), ('vehicles', 'ヘリコプター', 'へりこぷたー'),
  ('vehicles', '救急車', '救急車'), ('vehicles', 'ロケット', 'ろけっと')
) as t(slug, text, normalized)
join public.categories c on c.slug = t.slug;
