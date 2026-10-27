"use strict";

/* =========================================================================
   RF Toroid Inductor Calculator — core data
   A_L (µH·N²/1000), physical dimensions and operating range per core, plus
   the standard AWG wire table. Source values transcribed from
   https://toroids.info/ (kitsandparts.com core catalogue).
   Loaded as a plain script (no build step); safe to import from Node too.
   ========================================================================= */

var TOROIDS = [
  { code:"T25-2",  name:"T25-2",   al:3.4,  od:6.48,  id:3.05,  ht:2.44,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T37-2",  name:"T37-2",   al:4.0,  od:9.53,  id:5.21,  ht:3.25,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T44-2",  name:"T44-2",   al:5.2,  od:11.2,  id:5.82,  ht:4.04,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T50-2",  name:"T50-2",   al:4.9,  od:12.7,  id:7.70,  ht:4.83,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T68-2",  name:"T68-2",   al:5.7,  od:17.5,  id:9.40,  ht:4.83,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T80-2",  name:"T80-2",   al:5.5,  od:20.2,  id:12.6,  ht:6.35,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T94-2",  name:"T94-2",   al:8.4,  od:23.9,  id:14.2,  ht:7.92,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T106-2", name:"T106-2",  al:13.5, od:26.9,  id:14.5,  ht:11.1,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T130-2", name:"T130-2",  al:11.0, od:33.0,  id:19.8,  ht:11.1,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T200-2", name:"T200-2",  al:12.0, od:50.8,  id:31.8,  ht:14.0,  mat:"µ-metal (type 2)",  color:"Red / Clear",   freq:"250 kHz – 10 MHz", class:"u-metal" },
  { code:"T50-6",  name:"T50-6",   al:4.0,  od:12.7,  id:7.70,  ht:4.83,  mat:"ferrite (type 6)",  color:"Yellow / Clear",freq:"3 – 40 MHz",        class:"ferrite" },
  { code:"T80-6",  name:"T80-6",   al:4.5,  od:20.2,  id:12.6,  ht:6.35,  mat:"ferrite (type 6)",  color:"Yellow / Clear",freq:"3 – 40 MHz",        class:"ferrite" },
  { code:"FT50-43", name:"FT50-43",  al:440,  od:12.7,  id:7.15,  ht:4.9,   mat:"ferrite 43",      color:"Shiny black",   freq:"5 – 400 MHz",       class:"ferrite" },
  { code:"FT140-43",name:"FT140-43",al:885,  od:35.55, id:23.0,  ht:12.7,  mat:"ferrite 43",      color:"Shiny black",   freq:"5 – 400 MHz",       class:"ferrite" },
  { code:"FT240-43",name:"FT240-43",al:1075, od:61.0,  id:35.55, ht:12.7,  mat:"ferrite 43",      color:"Shiny black",   freq:"5 – 400 MHz",       class:"ferrite" },
  { code:"FT240-31",name:"FT240-31",al:3180, od:61.0,  id:35.55, ht:12.7,  mat:"ferrite 31",      color:"Black",         freq:"1 – 300 MHz",       class:"ferrite" }
];

// Standard magnet-wire gauges. bare = copper diameter, ins = insulated
// (enamel) outer diameter used for winding-density estimates. mm.
var AWG_TABLE = [
  { awg:36, bare:0.125, ins:0.20 },
  { awg:34, bare:0.155, ins:0.24 },
  { awg:32, bare:0.195, ins:0.28 },
  { awg:30, bare:0.244, ins:0.34 },
  { awg:28, bare:0.308, ins:0.42 },
  { awg:26, bare:0.385, ins:0.51 },
  { awg:24, bare:0.488, ins:0.63 },
  { awg:22, bare:0.611, ins:0.78 },
  { awg:20, bare:0.767, ins:0.95 },
  { awg:18, bare:0.965, ins:1.20 },
  { awg:16, bare:1.22,  ins:1.50 },
  { awg:14, bare:1.54,  ins:1.88 },
  { awg:12, bare:1.93,  ins:2.32 },
  { awg:10, bare:2.41,  ins:2.89 }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TOROIDS: TOROIDS, AWG_TABLE: AWG_TABLE };
}
