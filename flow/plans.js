/* Simplified flows of 0.1 (2026-10-02). Eric: "simplified flows for the review process and
   discovery process for this version only — discovery meaning the ability to find new albums".
   Each plan shows only its pages (`nodes`), placed left to right, with the arrows that
   matter; spots and images come from flow-data.js.
   REVIEW: home deck / search / trending → album page → rate & review sheet.
   DISCOVERY: home (friends' deck + feed) / search / trending (deck + wall) → album → artist → more albums. */
window.FLOW_PLANS = window.FLOW_PLANS || {};
window.FLOW_PLANS["review"] = {
 "name": "Review process",
 "nodes": [
  "home",
  "search",
  "trending",
  "album",
  "rate-sheet"
 ],
 "pos": {
  "home": [
   0,
   0
  ],
  "search": [
   0,
   1071
  ],
  "trending": [
   0,
   2142
  ],
  "album": [
   912,
   1071
  ],
  "rate-sheet": [
   1824,
   1071
  ]
 },
 "edges": [
  {
   "id": "s1",
   "from": "home",
   "fx": 0.5,
   "fy": 0.3022,
   "to": "album",
   "label": "From home: the deck's front cover"
  },
  {
   "id": "s2",
   "from": "search",
   "fx": 0.173,
   "fy": 0.7603,
   "to": "album",
   "label": "From search: a result"
  },
  {
   "id": "s3",
   "from": "trending",
   "fx": 0.5,
   "fy": 0.3022,
   "to": "album",
   "label": "From trending: the deck's front cover"
  },
  {
   "id": "s4",
   "from": "album",
   "fx": 0.5,
   "fy": 0.8186,
   "to": "rate-sheet",
   "label": "Your review \u2192 rate, write, save"
  }
 ]
};
window.FLOW_PLANS["discovery"] = {
 "name": "Discovery",
 "nodes": [
  "home",
  "home-expanded",
  "search",
  "trending",
  "trending-expanded",
  "album",
  "artist"
 ],
 "pos": {
  "home": [
   442,
   0
  ],
  "home-expanded": [
   0,
   0
  ],
  "search": [
   1254,
   0
  ],
  "trending": [
   1254,
   1151
  ],
  "trending-expanded": [
   1696,
   1151
  ],
  "album": [
   2548,
   575.5
  ],
  "artist": [
   3340,
   575.5
  ]
 },
 "edges": [
  {
   "id": "s1",
   "from": "home",
   "fx": 0.4118,
   "fy": 0.9548,
   "to": "search",
   "label": "Nav: Search"
  },
  {
   "id": "s2",
   "from": "home",
   "fx": 0.5881,
   "fy": 0.9548,
   "to": "trending",
   "label": "Nav: Trending"
  },
  {
   "id": "s3",
   "from": "home",
   "fx": 0.5,
   "fy": 0.3022,
   "to": "album",
   "label": "Friends' deck: a cover"
  },
  {
   "id": "s4",
   "from": "home-expanded",
   "fx": 0.5,
   "fy": 0.3679,
   "to": "album",
   "label": "The feed: a friend's review"
  },
  {
   "id": "s5",
   "from": "search",
   "fx": 0.173,
   "fy": 0.7603,
   "to": "album",
   "label": "Search: a result"
  },
  {
   "id": "s6",
   "from": "trending",
   "fx": 0.5,
   "fy": 0.3022,
   "to": "album",
   "label": "Discovery deck: a cover"
  },
  {
   "id": "s7",
   "from": "trending-expanded",
   "fx": 0.187,
   "fy": 0.32,
   "to": "album",
   "label": "The wall: a tile"
  },
  {
   "id": "s8",
   "from": "album",
   "fx": 0.3809,
   "fy": 0.6539,
   "to": "artist",
   "label": "Artist name"
  },
  {
   "id": "s9",
   "from": "artist",
   "fx": 0.18,
   "fy": 0.885,
   "to": "album",
   "label": "More by the artist"
  }
 ]
};
