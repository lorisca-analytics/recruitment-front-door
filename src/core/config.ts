import { EventConfig } from './types';

// Demo configuration. In the sheet this lives on a Config tab, so running a new
// event means editing cells, not code. All values here are invented.
export const DEMO_CONFIG: EventConfig = {
  idPrefix: 'DEMO',
  idPad: 4,
  eventName: 'Demo Mass Interview Day',
  eventDate: '2026-03-14',
  eventTime: '08:30',
  venueLine1: 'Hall B, Demo Training Centre',
  venueLine2: 'Demo City',
  candidatesPerDesk: 10,
  maxPerSession: 50,
  maxEmailsPerRun: 20,
  tracks: [
    {
      code: 'SALES',
      label: 'Sales Officer',
      minEducation: 'Diploma 3',
      minAge: 20,
      maxAge: 30,
      minGpa: 2.75,
      requiresSalesLicence: false,
      allowActiveStudents: false,
      zoneColour: 'Red',
      seatingArea: 'Left',
    },
    {
      code: 'TRAINEE',
      label: 'Sales Trainee Programme',
      minEducation: 'Bachelor',
      minAge: 20,
      maxAge: 26,
      minGpa: 3.0,
      requiresSalesLicence: false,
      allowActiveStudents: false,
      zoneColour: 'Pink',
      seatingArea: 'Centre',
    },
    {
      code: 'ADVISOR',
      label: 'Insurance Advisor',
      minEducation: 'Diploma 3',
      minAge: 21,
      maxAge: 35,
      minGpa: null,
      requiresSalesLicence: true,
      allowActiveStudents: false,
      zoneColour: 'Blue',
      seatingArea: 'Right',
    },
  ],
};

export function findTrack(config: EventConfig, code: string) {
  const track = config.tracks.find((t) => t.code === code);
  if (!track) throw new Error(`Unknown track "${code}". Add it to the Config tab.`);
  return track;
}
