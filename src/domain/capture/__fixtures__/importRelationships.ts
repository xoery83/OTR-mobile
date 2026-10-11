import type { Json } from "../../trip/eventIntentJson";

// Synthetic proposal-local tokens only. These vectors are not admitted domain objects.
export type ImportRelationshipVector = {
  name: string;
  inputs: string[];
  nodes: {
    token: string;
    kind: "ITEM" | "SEGMENT" | "STAY" | "RENTAL" | "BOOKING" | "TICKET" | "DOCUMENT";
    facts: Record<string, Json>;
    evidence: string[];
  }[];
  edges: {
    from: string;
    to: string;
    relation: "BOOKING_ITEM" | "TICKET_SEGMENT" | "DOCUMENT_ATTACHMENT" | "TICKET_ITEM";
    evidence: string[];
  }[];
  unresolved: { left: string; right: string; reason: string }[];
};
export const importRelationshipVectors: ImportRelationshipVector[] = [
  {
    name: "Air NZ return and duplicate evidence",
    inputs: ["confirmation", "boarding-pass"],
    nodes: [
      {
        token: "outbound",
        kind: "SEGMENT",
        facts: {
          service: "NZ5069",
          date: "2026-12-18",
          origin: "AKL",
          destination: "CHC",
        },
        evidence: ["confirmation", "boarding-pass"],
      },
      {
        token: "return",
        kind: "SEGMENT",
        facts: {
          service: "NZ5070",
          date: "2026-12-20",
          origin: "CHC",
          destination: "AKL",
        },
        evidence: ["confirmation"],
      },
      {
        token: "order",
        kind: "BOOKING",
        facts: { reference: "SYNTHETIC-ORDER", supplier: "NZ" },
        evidence: ["confirmation"],
      },
    ],
    edges: [
      {
        from: "order",
        to: "outbound",
        relation: "BOOKING_ITEM",
        evidence: ["confirmation"],
      },
      {
        from: "order",
        to: "return",
        relation: "BOOKING_ITEM",
        evidence: ["confirmation"],
      },
    ],
    unresolved: [],
  },
  {
    name: "DOC three stays and supplemental booking",
    inputs: ["hut-order", "supplement"],
    nodes: [
      {
        token: "stay-one",
        kind: "STAY",
        facts: {
          property: "Synthetic Hut One",
          checkIn: "2026-12-14",
          checkOut: "2026-12-15",
        },
        evidence: ["hut-order"],
      },
      {
        token: "stay-two",
        kind: "STAY",
        facts: {
          property: "Synthetic Hut Two",
          checkIn: "2026-12-15",
          checkOut: "2026-12-16",
        },
        evidence: ["hut-order", "supplement"],
      },
      {
        token: "stay-three",
        kind: "STAY",
        facts: {
          property: "Synthetic Hut Three",
          checkIn: "2026-12-16",
          checkOut: "2026-12-17",
        },
        evidence: ["hut-order"],
      },
      {
        token: "hut-order",
        kind: "BOOKING",
        facts: { supplier: "DOC", reference: "SYNTHETIC-HUT-ORDER" },
        evidence: ["hut-order"],
      },
      {
        token: "supplement",
        kind: "BOOKING",
        facts: {
          supplier: "DOC",
          reference: "SYNTHETIC-SUPPLEMENT",
          applicability: "additional capacity",
        },
        evidence: ["supplement"],
      },
    ],
    edges: [
      ...["stay-one", "stay-two", "stay-three"].map((to) => ({
        from: "hut-order",
        to,
        relation: "BOOKING_ITEM" as const,
        evidence: ["hut-order"],
      })),
      {
        from: "supplement",
        to: "stay-two",
        relation: "BOOKING_ITEM",
        evidence: ["supplement"],
      },
    ],
    unresolved: [],
  },
  {
    name: "Thrifty two rentals and ambiguous shared reference",
    inputs: ["rental-one", "rental-two"],
    nodes: [
      {
        token: "rental-one",
        kind: "RENTAL",
        facts: {
          pickup: "2026-12-14T11:00",
          pickupPlace: "Nelson Airport",
          return: "2026-12-20T11:00",
          reservedClass: "Small car or similar",
        },
        evidence: ["rental-one"],
      },
      {
        token: "rental-two",
        kind: "RENTAL",
        facts: {
          pickup: "2026-12-14T11:00",
          pickupPlace: "Nelson Airport",
          return: "2026-12-22T11:00",
          reservedClass: "SUV or similar",
        },
        evidence: ["rental-two"],
      },
      {
        token: "order-one",
        kind: "BOOKING",
        facts: { reference: "SYNTHETIC-AMBIGUOUS", supplier: "Thrifty", paid: null },
        evidence: ["rental-one"],
      },
      {
        token: "order-two",
        kind: "BOOKING",
        facts: { reference: "SYNTHETIC-AMBIGUOUS", supplier: "Thrifty", paid: null },
        evidence: ["rental-two"],
      },
    ],
    edges: [
      {
        from: "order-one",
        to: "rental-one",
        relation: "BOOKING_ITEM",
        evidence: ["rental-one"],
      },
      {
        from: "order-two",
        to: "rental-two",
        relation: "BOOKING_ITEM",
        evidence: ["rental-two"],
      },
    ],
    unresolved: [
      { left: "order-one", right: "order-two", reason: "REFERENCE_ALONE_NOT_IDENTITY" },
    ],
  },
  {
    name: "SNCF multi-segment shared ticket",
    inputs: ["rail-ticket"],
    nodes: [
      {
        token: "rail-one",
        kind: "SEGMENT",
        facts: {
          operator: "SNCF",
          origin: "Synthetic Station A",
          destination: "Synthetic Station B",
          arrival: "2026-12-18T10:00",
        },
        evidence: ["rail-ticket"],
      },
      {
        token: "rail-two",
        kind: "SEGMENT",
        facts: {
          operator: "SNCF",
          origin: "Synthetic Station B",
          destination: "Synthetic Station C",
          departure: "2026-12-18T10:02",
        },
        evidence: ["rail-ticket"],
      },
      {
        token: "shared-ticket",
        kind: "TICKET",
        facts: {
          access: "ORIGINAL_STATIC",
          holder: null,
          totalMinor: 3200,
          currency: "EUR",
        },
        evidence: ["rail-ticket"],
      },
    ],
    edges: [
      {
        from: "shared-ticket",
        to: "rail-one",
        relation: "TICKET_SEGMENT",
        evidence: ["rail-ticket"],
      },
      {
        from: "shared-ticket",
        to: "rail-two",
        relation: "TICKET_SEGMENT",
        evidence: ["rail-ticket"],
      },
    ],
    unresolved: [],
  },
  {
    name: "Water taxi outward and return",
    inputs: ["water-taxi-order"],
    nodes: [
      {
        token: "water-out",
        kind: "SEGMENT",
        facts: {
          date: "2026-12-16",
          origin: "Synthetic Mainland",
          destination: "Synthetic Island",
        },
        evidence: ["water-taxi-order"],
      },
      {
        token: "water-back",
        kind: "SEGMENT",
        facts: {
          date: "2026-12-19",
          origin: "Synthetic Island",
          destination: "Synthetic Mainland",
        },
        evidence: ["water-taxi-order"],
      },
      {
        token: "water-order",
        kind: "BOOKING",
        facts: { supplier: "Synthetic Water Taxi" },
        evidence: ["water-taxi-order"],
      },
    ],
    edges: [
      {
        from: "water-order",
        to: "water-out",
        relation: "BOOKING_ITEM",
        evidence: ["water-taxi-order"],
      },
      {
        from: "water-order",
        to: "water-back",
        relation: "BOOKING_ITEM",
        evidence: ["water-taxi-order"],
      },
    ],
    unresolved: [],
  },
  {
    name: "Group QR and independent permit",
    inputs: ["group-ticket", "hiking-permit"],
    nodes: [
      {
        token: "ferry-leg",
        kind: "SEGMENT",
        facts: { date: "2026-12-18" },
        evidence: ["group-ticket"],
      },
      {
        token: "group-ticket",
        kind: "TICKET",
        facts: {
          capacity: 5,
          holder: null,
          credentialFaces: 1,
          access: "ORIGINAL_STATIC",
        },
        evidence: ["group-ticket"],
      },
      {
        token: "permit",
        kind: "TICKET",
        facts: { title: "Synthetic hiking entitlement", date: null, holder: null },
        evidence: ["hiking-permit"],
      },
    ],
    edges: [
      {
        from: "group-ticket",
        to: "ferry-leg",
        relation: "TICKET_SEGMENT",
        evidence: ["group-ticket"],
      },
    ],
    unresolved: [],
  },
  {
    name: "Unrelated document and ticket attachment",
    inputs: ["uploaded-original"],
    nodes: [
      {
        token: "item-a",
        kind: "ITEM",
        facts: { title: "Synthetic dinner", origin: "USER_INTENT" },
        evidence: [],
      },
      {
        token: "item-b",
        kind: "ITEM",
        facts: { title: "Synthetic concert" },
        evidence: ["uploaded-original"],
      },
      {
        token: "original",
        kind: "DOCUMENT",
        facts: { acquired: true },
        evidence: ["uploaded-original"],
      },
      {
        token: "concert-ticket",
        kind: "TICKET",
        facts: { access: "EXTERNAL_DYNAMIC", offline: null },
        evidence: ["uploaded-original"],
      },
    ],
    edges: [
      {
        from: "original",
        to: "item-a",
        relation: "DOCUMENT_ATTACHMENT",
        evidence: ["uploaded-original"],
      },
      {
        from: "concert-ticket",
        to: "item-b",
        relation: "TICKET_ITEM",
        evidence: ["uploaded-original"],
      },
    ],
    unresolved: [],
  },
];
