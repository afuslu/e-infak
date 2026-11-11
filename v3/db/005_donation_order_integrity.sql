BEGIN;
-- An existing inconsistent record must abort migration, never be silently fixed.
ALTER TABLE einfak.order_items ADD CONSTRAINT order_item_order_identity UNIQUE (organization_id,id,order_id);
ALTER TABLE einfak.payment_events ADD CONSTRAINT payment_event_order_identity UNIQUE (organization_id,id,order_id);
ALTER TABLE einfak.donations ADD COLUMN order_id uuid;
UPDATE einfak.donations d SET order_id=i.order_id
 FROM einfak.order_items i WHERE i.organization_id=d.organization_id AND i.id=d.order_item_id;
ALTER TABLE einfak.donations ALTER COLUMN order_id SET NOT NULL;
ALTER TABLE einfak.donations ADD CONSTRAINT donation_item_order
 FOREIGN KEY (organization_id,order_item_id,order_id)
 REFERENCES einfak.order_items(organization_id,id,order_id);
ALTER TABLE einfak.donations ADD CONSTRAINT donation_payment_order
 FOREIGN KEY (organization_id,payment_event_id,order_id)
 REFERENCES einfak.payment_events(organization_id,id,order_id);
COMMIT;
