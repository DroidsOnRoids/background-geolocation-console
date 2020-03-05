/* eslint-disable no-console */
import Promise from 'bluebird';
import isUndefined from 'lodash/isUndefined';
import omitBy from 'lodash/omitBy';

import {
  deleteCollection,
  firestore,
} from '.';

import {
  AccessDeniedError,
  isDeniedCompany,
  isDeniedDevice,
  toRows,
} from '../libs/utils';

import { findOrCreate } from './Device';

export async function getStats() {
  return {
    minDate: '?',
    maxDate: '?',
    total: '?',
  };
}

export async function getLocations(params, isAdmin) {
  const {
    org,
    end_date: endDate,
    start_date: startDate,
    uuid,
  } = params || {};

  if (!isAdmin && !(uuid || org)) {
    return [];
  }

  try {
    let query = firestore
      .collection('Org').doc(org)
      .collection('Devices').doc(uuid)
      .collection('Locations');

    if (startDate && endDate) {
      query = query
        .where('recorded_at', '>', new Date(startDate))
        .where('recorded_at', '<', new Date(endDate));
    }

    const snapshot = await query
      .orderBy('recorded_at', 'desc')
      .get();

    return toRows(snapshot);
  } catch (e) {
    console.error('v3:getLocations', org, uuid, e);
    return [];
  }
}

export async function getLatestLocation(params, isAdmin) {
  const {
    org,
    uuid,
  } = params || {};

  if (!isAdmin && !(uuid || org)) {
    return [];
  }

  try {
    const lastLocation = await firestore
      .collection('Org').doc(org)
      .collection('Devices').doc(uuid)
      .collection('Locations')
      .orderBy('recorded_at', 'desc')
      .limit(1)
      .get();
    return toRows(lastLocation);
  } catch (e) {
    console.error('v3:getLatestLocation', org, uuid, e);
    return [];
  }
}


export async function createLocation(location, deviceInfo, org, batch) {
  const now = new Date();
  const { uuid } = deviceInfo;

  const currentDevice = await findOrCreate(org, { ...deviceInfo });

  console.info(
    'location:create'.green,
    'org:name'.green,
    org,
    'org'.green,
    'device:uuid'.green,
    currentDevice.uuid,
  );

  const orgRef = firestore
    .collection('Org').doc(org);
  batch.update(orgRef, { updated_at: now });

  const deviceRef = firestore
    .collection('Org').doc(org)
    .collection('Devices').doc(uuid);
  batch.update(deviceRef, { updated_at: now });

  const data = omitBy(
    {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      data: location,
      recorded_at: location.timestamp,
      created_at: now,
      org,
      uuid,
    },
    isUndefined,
  );

  return firestore
    .collection('Org').doc(org)
    .collection('Devices').doc(uuid)
    .collection('Locations')
    .add(data);
}

export async function createLocations(
  locations,
  device,
  org,
) {
  if (isDeniedCompany(org)) {
    throw new AccessDeniedError(
      'This is a question from the CEO of Transistor Software.\n' +
        'Why are you spamming my demo server1?\n' +
        'Please email me at chris@transistorsoft.com.',
    );
  }

  if (isDeniedDevice(device.model)) {
    throw new AccessDeniedError(
      'This is a question from the CEO of Transistor Software.\n' +
        'Why are you spamming my demo server2?\n' +
        'Please email me at chris@transistorsoft.com.',
    );
  }
  const batch = firestore.batch();
  await Promise.reduce(
    locations,
    async (p, location) => {
      try {
        return createLocation(
          location,
          device,
          org,
          batch,
        );
      } catch (e) {
        console.error('createLocation', e);
        throw e;
      }
    },
    0,
  );
  await batch.commit();
}

export async function create(params) {
  const {
    company_token: token = 'UNKNOWN',
    location: list = [],
    device = { model: 'UNKNOWN', uuid: 'UNKNOWN' },
  } = params;
  const locations = Array.isArray(list)
    ? list
    : (
      list
        ? [list]
        : []
    );

  return createLocations(locations, device, token);
}

export async function deleteLocations(params, isAdmin) {
  const {
    org,
    end_date: endDate,
    start_date: startDate,
    uuid,
  } = params || {};

  if (!isAdmin && !(org || uuid)) {
    return;
  }

  if (startDate && endDate && new Date(startDate) && new Date(endDate)) {
    await deleteCollection(
      firestore,
      'recorded_at',
      firestore
        .collection('Org').doc(org)
        .collection('Devices').doc(uuid)
        .collection('Locations')
        .where('recorded_at', '>', new Date(startDate))
        .where('recorded_at', '<', new Date(endDate)),
    );
  }

  const first = await firestore
    .collection('Org').doc(org)
    .collection('Devices').doc(uuid)
    .collection('Locations')
    .limit(1)
    .get();

  if (!first.exists) {
    await firestore
      .collection('Org').doc(org)
      .collection('Devices').doc(uuid)
      .delete();
  }
}
