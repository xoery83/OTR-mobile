# UI BLUEPRINT — Part 2 P3–P6
## Shell / Form transitions
Day Feed Focus small border + (Future/Today) → Add Itinerary bottom sheet (Plan/Flexible first row; five P2–P6 icons second) → full-screen form on same presentation context → Cancel or Save returns to same Day Feed anchor; after Save update affected day and preserve scroll. Capture Quick Add reuses this entry. Do not replace with Capture Review.
## Common screen structure
Navigation: Cancel | New/Edit [Type] | Save. Top: primary name and location/route fields, prominent Scan/Update Document. Middle: type-specific dates, locations, local times. Lower: contextual Participants (except P4 manual Create), Notes. Scan results expand as cards in same Form with per-object duplicate decisions; no false confirmation before Save.
## P3
Create Stay: name, optional SDK/free-text location, Scan, check-in/check-out date required, optional clock time, Participants, Notes. Multi-stay scan inline duplicates. Edit reveals contact and instructions, update from document. Future/Today/Past Immersive refer to baseline and original screenshots; no generated hotel photography.
## P4
Create Rental: one name, Scan, Pickup date/time/place, Return date/time/place, Notes. Multi-vehicle scan separate identities. Edit full pickup/return instructions and optional actual vehicle details. Immersive action first Today; Link expense primary; Add secondary. No generated car photography.
## P5
Create Transport: type + Custom, one name, Scan, Departure date/place required, time optional NTC, arrival fields optional, Participants. Multi-segment scan. Edit dynamic original labels and values, with stable semantic mapping. Immersive per segment; real Ticket prominent Today; offline access status explicit.
## P6
Create Activity: name + date required, venue optional, Scan, time optional NTC, optional end and entry/meeting, Participants, Description. Multi-activity scan; per-activity duplicate resolution and ticket coverage. Edit includes entry instructions, contact, dynamic admission details, separate Ticket/Voucher/Booking evidence. Immersive Today entry details immediately followed by Ticket; Past photo strip only with real authorized photos.
## Screenshot inventory
See VISUAL_INDEX.csv. Screenshots are original user-captured reference images and may contain simulated values and superseded UI details. Text contracts take precedence.
## QA / acceptance
- Validate NTC without fabricated clock times and sorting/return-anchor behavior.
- Verify scans cannot silently overwrite existing item or ticket identities; Cancel leaves persisted state untouched.
- Verify a single Booking can contain multiple Stays/Rentals/Segments/Activities without merging distinct items.
- Verify Ticket Identity acceptance vectors, offline states and permissions.
- Verify expense Add/Link distinct and no duplicate booking-level expense counting.
- Verify original photos only; no generated provider images; empty Past gallery hidden.
- Validate source-specific timezone and user-facing labels/translation.
