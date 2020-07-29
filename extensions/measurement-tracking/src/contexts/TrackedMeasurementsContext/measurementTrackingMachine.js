import { assign } from 'xstate';

const RESPONSE = {
  NO_NEVER: -1,
  CANCEL: 0,
  CREATE_REPORT: 1,
  ADD_SERIES: 2,
  SET_STUDY_AND_SERIES: 3,
  NO_NOT_FOR_SERIES: 4,
};

const machineConfiguration = {
  id: 'measurementTracking',
  initial: 'idle',
  context: {
    trackedStudy: '',
    trackedSeries: [],
    ignoredSeries: [],
    //
    prevTrackedStudy: '',
    prevTrackedSeries: [],
    prevIgnoredSeries: [],
  },
  states: {
    off: {
      type: 'final',
    },
    idle: {
      entry: 'clearContext',
      on: {
        TRACK_SERIES: 'promptBeginTracking',
        SET_TRACKED_SERIES: [
          {
            target: 'tracking',
            actions: ['setTrackedStudyAndMultipleSeries'],
          },
        ],
      },
    },
    promptBeginTracking: {
      invoke: {
        src: 'promptBeginTracking',
        onDone: [
          {
            target: 'tracking',
            actions: ['setTrackedStudyAndSeries'],
            cond: 'shouldSetStudyAndSeries',
          },
          {
            target: 'off',
            cond: 'shouldKillMachine',
          },
          {
            target: 'idle',
          },
        ],
        onError: {
          target: 'idle',
        },
      },
    },
    // TODO: --> Create report; initiated by save button?
    tracking: {
      on: {
        TRACK_SERIES: [
          {
            target: 'promptTrackNewStudy',
            cond: 'isNewStudy',
          },
          {
            target: 'promptTrackNewSeries',
            cond: 'isNewSeries',
          },
        ],
        UNTRACK_SERIES: [
          {
            target: 'tracking',
            actions: ['removeTrackedSeries'],
            cond: 'hasRemainingTrackedSeries',
          },
          {
            target: 'idle',
          },
        ],
        SET_TRACKED_SERIES: [
          {
            target: 'tracking',
            actions: ['setTrackedStudyAndMultipleSeries'],
          },
        ],
        SAVE_REPORT: 'promptSaveReport',
      },
    },
    promptTrackNewSeries: {
      invoke: {
        src: 'promptTrackNewSeries',
        onDone: [
          {
            target: 'tracking',
            actions: ['addTrackedSeries'],
            cond: 'shouldAddSeries',
          },
          {
            target: 'tracking',
            actions: [
              'discardExternalMeasurements',
              'setTrackedStudyAndSeries',
            ],
            cond: 'shouldSetStudyAndSeries',
          },
          {
            target: 'promptSaveReport',
            cond: 'shouldPromptSaveReport',
          },
          {
            target: 'tracking',
          },
        ],
        onError: {
          target: 'idle',
        },
      },
    },
    promptTrackNewStudy: {
      invoke: {
        src: 'promptTrackNewStudy',
        onDone: [
          {
            target: 'tracking',
            actions: [
              'discardExternalMeasurements',
              'setTrackedStudyAndSeries',
            ],
            cond: 'shouldSetStudyAndSeries',
          },
          {
            target: 'tracking',
            actions: ['ignoreSeries'],
            cond: 'shouldAddIgnoredSeries',
          },
          {
            target: 'promptSaveReport',
            cond: 'shouldPromptSaveReport',
          },
          {
            target: 'tracking',
          },
        ],
        onError: {
          target: 'idle',
        },
      },
    },
    promptSaveReport: {
      invoke: {
        src: 'promptSaveReport',
        onDone: [
          // did save
          {
            target: 'idle',
            actions: ['discardExternalMeasurements'],
            cond: 'shouldPromptSaveReport',
          },
          // cancel
          {
            target: 'tracking',
          },
        ],
        onError: {
          target: 'idle',
        },
      },
    },
  },
  strict: true,
};

const defaultOptions = {
  services: {
    promptBeginTracking: (ctx, evt) => {
      // return { userResponse, StudyInstanceUID, SeriesInstanceUID }
    },
    promptTrackNewStudy: (ctx, evt) => {
      // return { userResponse, StudyInstanceUID, SeriesInstanceUID }
    },
    promptTrackNewSeries: (ctx, evt) => {
      // return { userResponse, StudyInstanceUID, SeriesInstanceUID }
    },
  },
  actions: {
    discardExternalMeasurements: (ctx, evt) => {
      console.log('discard external', ctx, evt);
    },
    clearContext: assign({
      trackedStudy: '',
      trackedSeries: [],
      ignoredSeries: [],
      prevTrackedStudy: '',
      prevTrackedSeries: [],
      prevIgnoredSeries: [],
    }),
    // Promise resolves w/ `evt.data.*`
    setTrackedStudyAndSeries: assign((ctx, evt) => ({
      prevTrackedStudy: ctx.trackedStudy,
      prevTrackedSeries: ctx.trackedSeries.slice(),
      prevIgnoredSeries: ctx.ignoredSeries.slice(),
      //
      trackedStudy: evt.data.StudyInstanceUID,
      trackedSeries: [evt.data.SeriesInstanceUID],
      ignoredSeries: [],
    })),
    setTrackedStudyAndMultipleSeries: assign((ctx, evt) => ({
      prevTrackedStudy: ctx.trackedStudy,
      prevTrackedSeries: ctx.trackedSeries.slice(),
      prevIgnoredSeries: ctx.ignoredSeries.slice(),
      //
      trackedStudy: evt.StudyInstanceUID,
      trackedSeries: [...ctx.trackedSeries, ...evt.SeriesInstanceUIDs],
      ignoredSeries: [],
    })),
    ignoreSeries: assign((ctx, evt) => ({
      ignoredSeries: [...ctx.ignoredSeries, evt.data.SeriesInstanceUID],
    })),
    addTrackedSeries: assign((ctx, evt) => ({
      trackedSeries: [...ctx.trackedSeries, evt.data.SeriesInstanceUID],
    })),
    removeTrackedSeries: assign((ctx, evt) => ({
      trackedSeries: ctx.trackedSeries
        .slice()
        .filter(ser => ser !== evt.SeriesInstanceUID),
    })),
  },
  guards: {
    shouldKillMachine: (ctx, evt) =>
      evt.data && evt.data.userResponse === RESPONSE.NO_NEVER,
    shouldAddSeries: (ctx, evt) =>
      evt.data && evt.data.userResponse === RESPONSE.ADD_SERIES,
    shouldSetStudyAndSeries: (ctx, evt) =>
      evt.data && evt.data.userResponse === RESPONSE.SET_STUDY_AND_SERIES,
    shouldAddIgnoredSeries: (ctx, evt) =>
      evt.data && evt.data.userResponse === RESPONSE.NO_NOT_FOR_SERIES,
    shouldPromptSaveReport: (ctx, evt) =>
      evt.data && evt.data.userResponse === RESPONSE.CREATE_REPORT,
    // Has more than 1, or SeriesInstanceUID is not in list
    // --> Post removal would have non-empty trackedSeries array
    hasRemainingTrackedSeries: (ctx, evt) =>
      ctx.trackedSeries.length > 1 ||
      !ctx.trackedSeries.includes(evt.SeriesInstanceUID),
    isNewStudy: (ctx, evt) =>
      !ctx.ignoredSeries.includes(evt.SeriesInstanceUID) &&
      ctx.trackedStudy !== evt.StudyInstanceUID,
    isNewSeries: (ctx, evt) =>
      !ctx.ignoredSeries.includes(evt.SeriesInstanceUID) &&
      !ctx.trackedSeries.includes(evt.SeriesInstanceUID),
  },
};

export { defaultOptions, machineConfiguration };
