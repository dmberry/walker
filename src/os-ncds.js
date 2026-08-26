// Walker.
// Copyright (C) 2026 David M. Berry
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later
// version. This program is distributed WITHOUT ANY WARRANTY; see the GNU
// General Public License for details: <https://www.gnu.org/licenses/>.

// The NCDS operating flavour: what makes the Neocloud hall terminal THIS
// machine rather than a shell in the abstract.
//
// unix.js is the machinery — the filesystem primitives, the command table,
// pipes and redirect — and knows nothing about any particular site. A flavour
// is the personality laid over it: the hostname and prompt user, the greeting,
// and above all the DISK, which is where a site keeps everything that makes it
// itself. Different datacentres will run different flavours; this file is the
// template for writing one.

import { dir, file, manPages } from './unix.js';

export const MOTD = [
  // Wrapped by hand to the console's 56 columns. The renderer wraps too, but it
  // breaks mid-word; prose this short is better set to fit.
  'NEOCLOUD DATA SOLUTIONS',
  'Hall 1 floor access terminal.',
  '',
  'This machine reads the building: environment, power,',
  'rack inventory, the maintenance log and the door and',
  'camera records. It has no route to the control plane',
  'and no route off site. Anything above the floor is',
  'done from operations.',
  '',
  'Guest sessions are not logged out. Walk away and it',
  'stays where you left it.',
].join('\n');

export function makeDisk() {
  // The standard pages come from the machinery; a flavour may add its own.
  const man = manPages();

  return dir({
    bin: dir({}),
    etc: dir({
      motd: file(MOTD),
      hostname: file('ncds-hal-01'),
      hosts: file([
        '127.0.0.1        localhost',
        '10.14.0.11       ncds-hal-01   this machine',
        '10.14.0.1        ncds-gw-01    gateway (filtered)',
        '10.14.2.4        ncds-bms-01   building management',
        '10.14.2.9        ncds-cam-01   camera recorder',
        '10.14.9.1        ncds-ops-01   operations (no route from here)',
      ].join('\n')),
      'hall.conf': file([
        'site            NCDS-01',
        'hall            1',
        'rows            18',
        'cabinets        432',
        'populated       288',
        'design_load_kW  1120',
        'current_load_kW  742',
        'cooling         4x CRAC, N+1',
        'utility_feed    dual, A live, B live',
        'generator       1x 1.6MVA, 2140 litres',
      ].join('\n')),
    }),
    usr: dir({ man }),
    var: dir({
      log: dir({
        'bms.log': file([
          '08-24 02:11  CRAC4  vibration above threshold, 4.1 mm/s',
          '08-24 02:11  CRAC4  alarm raised, work order NC-4471',
          '08-24 02:12  CRAC3  brought out of standby',
          '08-25 06:40  HALL1  cold aisle 18.2 C, within band',
          '08-25 13:02  HALL1  hot aisle 31.6 C, within band',
          '08-25 19:55  CRAC4  vibration 4.6 mm/s, rising',
          '08-26 04:18  HALL1  humidity 41 %RH, within band',
          '08-26 09:30  CRAC4  vibration 5.0 mm/s, engineer not attended',
        ].join('\n')),
        'power.log': file([
          '08-24 00:00  FEED A  381 kW   FEED B  361 kW',
          '08-24 12:00  FEED A  392 kW   FEED B  358 kW',
          '08-25 00:00  FEED A  377 kW   FEED B  364 kW',
          '08-25 12:00  FEED A  390 kW   FEED B  359 kW',
          '08-26 00:00  FEED A  374 kW   FEED B  368 kW',
          '08-26 09:30  FEED A  379 kW   FEED B  363 kW',
          '',
          'Row C-01 is racked and unpowered. Capacity review NC-4480.',
        ].join('\n')),
        'door.log': file([
          '08-19 07:41  DOOR1  open   badge 0041',
          '08-19 07:58  DOOR1  closed',
          '08-19 16:22  DOOR1  open   badge 0041',
          '08-19 16:24  DOOR1  closed',
          '08-21 11:03  DOOR1  open   badge 0017',
          '08-21 11:49  DOOR1  closed',
          '08-21 11:49  DOOR1  closer adjusted, work order NC-4433',
          '08-26 --:--  DOOR1  open   no badge',
        ].join('\n')),
      }),
    }),
    hall: dir({
      inventory: file([
        'ROW    CABINETS  POPULATED  LOAD kW',
        'A-01         24         24     31.2',
        'A-02         24         23     29.8',
        'A-03         24         24     30.9',
        'A-04         24         24     31.4',
        'B-01         24         18     22.4',
        'B-02         24         11     13.7',
        'B-03         24         14     17.9',
        'C-01         24          0      0.0',
        '',
        'Rows C-02 to C-06 are racked and unpowered.',
      ].join('\n')),
      environment: file([
        'Cold aisle       18.4 C',
        'Hot aisle        31.1 C',
        'Humidity         41 %RH',
        'Pressure diff    12 Pa',
        'CRAC 1           running',
        'CRAC 2           running',
        'CRAC 3           running',
        'CRAC 4           fault, bearing, work order NC-4471',
      ].join('\n')),
      'maintenance.log': file([
        '2026-05-02  NC-4390  CRAC 3 filter change               closed',
        '2026-05-19  NC-4412  Row B-02 PDU phase imbalance       closed',
        '2026-06-08  NC-4433  Door 1 closer adjusted             closed',
        '2026-07-14  NC-4458  Yard lamp 3 replaced               closed',
        '2026-08-03  NC-4471  CRAC 4 bearing noise               open',
        '2026-08-17  NC-4480  Row C-01 unpowered, capacity        open',
        '                     review pending',
      ].join('\n')),
    }),
    site: dir({
      access: file([
        'Perimeter fence     intact',
        'Gate                unlocked',
        'Door 1  south       unlocked',
        'Door 2  north       sealed, plated 2026-04',
        'Cameras             8 of 8 reporting',
        'Yard lamps          4 of 4',
        'Sign floodlights    4 of 4',
      ].join('\n')),
      cameras: file([
        'CAM  VIEW                    STATE     RECORDING',
        '  1  gate, outbound          ok        7 days',
        '  2  gate, inbound           ok        7 days',
        '  3  south elevation, west   ok        7 days',
        '  4  south elevation, east   ok        7 days',
        '  5  door 1                  ok        7 days',
        '  6  sign                    ok        7 days',
        '  7  north elevation         ok        7 days',
        '  8  yard, plant             ok        7 days',
      ].join('\n')),
    }),
    home: dir({
      guest: dir({
        notes: file('Nothing written here yet.'),
      }),
    }),
  });
}


// What the terminal needs to know about this machine, in one object.
export default {
  name: 'ncds',
  host: 'ncds-hal-01',
  user: 'guest',
  home: ['home', 'guest'],
  motd: MOTD,
  makeDisk,
};
