-- ItenGear Seed Data: Sample Products
-- Run AFTER schema.sql on your Supabase SQL Editor
-- This requires at least one vendor_profile to exist

-- First, create a demo vendor user and profile
INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role, email_verified, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'vendor@demo.com',
  '$2a$10$X7UrH5YxX3Aq3iLMqO9Zj.8jY7Rq5Z1O4iKjJ8Kl9MnBvCxDwEfG',
  'Demo',
  'Vendor',
  '+254700000001',
  'vendor',
  true,
  true
) ON CONFLICT (email) DO NOTHING;

INSERT INTO vendor_profiles (id, user_id, store_name, store_description, is_verified, commission_rate, city, country)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'ItenGear Sports',
  'Premium sports equipment for athletes and fitness enthusiasts',
  true,
  10.00,
  'Nairobi',
  'Kenya'
) ON CONFLICT (user_id) DO NOTHING;

-- Seed products (using the demo vendor above)
INSERT INTO products (vendor_id, category_id, name, slug, description, short_description, price, compare_price, currency, quantity, brand, thumbnail, is_active, is_featured) VALUES
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='running'), 'Nike Air Zoom Pegasus 40', 'nike-air-zoom-pegasus-40', 'The Nike Air Zoom Pegasus 40 features responsive cushioning and a lightweight design perfect for everyday running.', 'Premium running shoes for everyday athletes', 12500, 15000, 'KES', 50, 'Nike', '/images/products/running-shoes.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='football'), 'Adidas Predator Edge', 'adidas-predator-edge', 'Professional football boots with advanced grip technology for maximum ball control.', 'Professional football boots with advanced grip', 18000, 22000, 'KES', 30, 'Adidas', '/images/products/football.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='basketball'), 'Under Armour Curry 11', 'under-armour-curry-11', 'Signature basketball shoe with responsive cushioning and ankle support.', 'Signature basketball shoe with responsive cushioning', 22000, 25000, 'KES', 25, 'Under Armour', '/images/products/jersey.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='tennis'), 'Wilson Pro Staff Tennis Racket', 'wilson-pro-staff-tennis', 'Professional-grade tennis racket favored by top players worldwide.', 'Professional-grade tennis racket', 35000, 40000, 'KES', 15, 'Wilson', '/images/products/gym-bag.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='swimming'), 'Speedo FastSkin Goggles', 'speedo-fastskin-goggles', 'Competition swimming goggles with anti-fog coating and UV protection.', 'Competition swimming goggles', 4500, 5500, 'KES', 100, 'Speedo', '/images/products/water-bottle.jpg', true, false),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='gym-fitness'), 'PowerBlock Adjustable Dumbbells', 'powerblock-adjustable-dumbbells', 'Space-saving adjustable dumbbells that replace 16 pairs of dumbbells.', 'Space-saving adjustable dumbbells 5-50lbs', 28000, 32000, 'KES', 20, 'PowerBlock', '/images/products/dumbbells.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='cycling'), 'Giant Defy Road Bike', 'giant-defy-road-bike', 'Endurance road bike designed for comfort on long-distance rides.', 'Endurance road bike for long-distance riding', 85000, 95000, 'KES', 8, 'Giant', '/images/products/fitness-tracker.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='athletics'), 'Nike Zoom Rival Sprint Spikes', 'nike-zoom-rival-sprint', 'Track spikes designed for sprint events with aggressive traction.', 'Track spikes for sprint events', 9500, 11000, 'KES', 40, 'Nike', '/images/products/running-shoes.jpg', true, false),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='football'), 'Puma Future Ultimate FG', 'puma-future-ultimate', 'Agility football boots with dynamic fit collar for a locked-in feel.', 'Agility football boots with dynamic fit', 16000, 19000, 'KES', 35, 'Puma', '/images/products/football.jpg', true, false),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='gym-fitness'), 'Reebok Nano X3 Training', 'reebok-nano-x3', 'Versatile cross-training shoe built for CrossFit and gym workouts.', 'Versatile cross-training shoe', 14000, 16500, 'KES', 45, 'Reebok', '/images/products/jersey.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='running'), 'Asics Gel-Kayano 30', 'asics-gel-kayano-30', 'Maximum support running shoe with gel cushioning system for overpronators.', 'Maximum support running shoe', 19500, 23000, 'KES', 28, 'Asics', '/images/products/running-shoes.jpg', true, true),
('b0000000-0000-0000-0000-000000000001', (SELECT id FROM categories WHERE slug='gym-fitness'), 'Yoga Mat Premium 6mm', 'yoga-mat-premium-6mm', 'Non-slip premium yoga mat with alignment markings and carrying strap.', 'Non-slip premium yoga mat', 3500, 4500, 'KES', 200, 'Generic', '/images/products/yoga-mat.jpg', true, false)
ON CONFLICT (slug) DO NOTHING;
