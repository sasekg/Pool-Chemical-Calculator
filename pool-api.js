(function (globalScope) {
  'use strict';

  const LITERS_PER_US_GALLON = 3.785411784;
  const US_FLUID_OUNCES_PER_US_GALLON = 128;
  const MILLILITERS_PER_LITER = 1000;
  const PARTS_PER_MILLION = 1 / 1_000_000;
  const MURIATIC_ACID_US_FLUID_OUNCES_PER_10000_GALLONS_PER_POINT_1_PH = 6;
  const REFERENCE_HCL_PERCENT = 31.45;
  const REFERENCE_TOTAL_ALKALINITY_PPM = 100;
  const ERROR_STATUS = "ERROR_STATUS";

  // #region Formulas

  const cyaCorrectionFactorForPH = {
    7.0: 0.22,
    7.2: 0.26,
    7.4: 0.30,
    7.6: 0.33,
    7.8: 0.35,
    8.0: 0.36
  };

  function calcCYACorrectionFactorForPH(ph) {
    const keys = Object.keys(cyaCorrectionFactorForPH);
    const maxKeyIndex = keys.length-1;
    if(ph < keys[0]) {
      return cyaCorrectionFactorForPH[0];
    } else if(ph > keys[maxKeyIndex]) {
      return cyaCorrectionFactorForPH[maxKeyIndex];
    } else {
      for(key in cyaCorrectionFactorForPH) {
        if(key >= ph){
          return cyaCorrectionFactorForPH[key];
        }
      }
    }
    return keys[maxKeyIndex];
  }

  function calcTotalAlkalinityWithPHandCYA(ta, ph, cya) {
    const correctionFactor = calcCYACorrectionFactorForPH(ph);
    return ta - (cya * correctionFactor);
  }

  // #endregion

  // #region Request Templates 
  // Dimensionless reference values expressed as test ppm produced per ppm of
  // pure product. Product purity belongs in active_ingredient_percent.
  const RELATIVE_MASSES = Object.freeze({
    calcium_chloride_anhydrous_to_calcium_hardness: 100.0869 / 110.98,
    calcium_chloride_dihydrate_to_calcium_hardness: 100.0869 / 147.014,
    chlorine_trichlor_to_free_chlorine: (3 * 70.906) / 232.41,
    chlorine_cal_hypo_to_free_chlorine: (2 * 70.906) / 142.98,

    // Empirical product reference: the current 64 oz per 10 ppm per 10,000
    // US gallons dose convention corresponds to a factor of 0.2.
    bioguard_optimizer_to_borate: 0.2,

    // Total alkalinity is conventionally reported as equivalent CaCO3.
    sodium_bicarbonate_to_total_alkalinity: 50.04345 / 84.0066
  });

  const commonRequestTemplate = Object.freeze({
    test_ppm: 2,
    target_ppm: 3,
    active_ingredient_percent: 31.45,
    relative_mass: 0.2
  });

  const usRequestTemplate = Object.freeze({
    ...commonRequestTemplate,
    pool_volume_us_gallons: 26000
  });

  const metricRequestTemplate = Object.freeze({
    ...commonRequestTemplate,
    pool_volume_liters: 98420.706384
  });

  const usMuriaticAcidRequestTemplate = Object.freeze({
    test_ph: 7.8,
    target_ph: 7.5,
    total_alkalinity_ppm: 100,
    percent_hcl: 31.45,
    pool_volume_us_gallons: 26000
  });

  const metricMuriaticAcidRequestTemplate = Object.freeze({
    test_ph: 7.8,
    target_ph: 7.5,
    total_alkalinity_ppm: 100,
    percent_hcl: 31.45,
    pool_volume_liters: 98420.706384
  });

  const usCyaDrainTimeRequestTemplate = Object.freeze({
    test_ppm: 80,
    target_ppm: 40,
    pool_volume_us_gallons: 26000,
    pump_flow_us_gallons_per_minute: 40
  });

  const metricCyaDrainTimeRequestTemplate = Object.freeze({
    test_ppm: 80,
    target_ppm: 40,
    pool_volume_liters: 98420.706384,
    pump_flow_liters_per_minute: 151.41647136
  });

  // #endregion

  // #region Pool calculations

  function errorResponse(code, message, fields) {
    return {
      ok: false,
      error: {
        code,
        message,
        fields: fields || []
      }
    };
  }

  function normalizeRequest(request) {
    if (typeof request === 'string') {
      try {
        return { ok: true, value: JSON.parse(request) };
      } catch (error) {
        return errorResponse('INVALID_JSON', 'The request is not valid JSON.');
      }
    }

    if (request === null || typeof request !== 'object' || Array.isArray(request)) {
      return errorResponse(
        'INVALID_REQUEST',
        'The request must be a JavaScript object or a JSON object string.'
      );
    }

    return { ok: true, value: request };
  }

  function validateRequest(request, volumeField) {
    const requiredFields = [...Object.keys(commonRequestTemplate), volumeField];
    const missingFields = requiredFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(request, field)
    );

    if (missingFields.length > 0) {
      return errorResponse(
        'MISSING_FIELDS',
        `Missing required fields: ${missingFields.join(', ')}.`,
        missingFields
      );
    }

    const invalidNumberFields = requiredFields.filter(
      (field) => typeof request[field] !== 'number' || !Number.isFinite(request[field])
    );

    if (invalidNumberFields.length > 0) {
      return errorResponse(
        'INVALID_NUMBERS',
        'All request fields must be finite JSON numbers.',
        invalidNumberFields
      );
    }

    const outOfRangeFields = [];

    if (request.test_ppm < 0) outOfRangeFields.push('test_ppm');
    if (request.target_ppm < 0) outOfRangeFields.push('target_ppm');
    if (request[volumeField] <= 0) outOfRangeFields.push(volumeField);
    if (
      request.active_ingredient_percent <= 0 ||
      request.active_ingredient_percent > 100.0
    ) {
      outOfRangeFields.push('active_ingredient_percent');
    }
    if (request.relative_mass <= 0) {
      outOfRangeFields.push('relative_mass');
    }

    if (outOfRangeFields.length > 0) {
      return errorResponse(
        'VALUE_OUT_OF_RANGE',
        'PPM values cannot be negative; pool volume and the response factor must be positive; active_ingredient_percent must be greater than 0 and at most 100.',
        outOfRangeFields
      );
    }

    return { ok: true };
  }

  function calculateProductDose(rawRequest, volumeField, volumeToLiters) {
    console.log(rawRequest);
    const normalized = normalizeRequest(rawRequest);
    if (!normalized.ok) return normalized;

    const request = normalized.value;
    const validation = validateRequest(request, volumeField);
    if (!validation.ok) return validation;

    const desiredTestChangePpm = Math.max(
      request.target_ppm - request.test_ppm,
      0
    );
    const effectiveTestResponse =
      (request.active_ingredient_percent / 100.0) *
      request.relative_mass;
    const requiredProductPpm = desiredTestChangePpm / effectiveTestResponse;
    const poolVolumeLiters = volumeToLiters(request[volumeField]);
    const productVolumeLiters =
      poolVolumeLiters * requiredProductPpm * PARTS_PER_MILLION;

    return {
      ok: true,
      data: {
        desired_test_change_ppm: desiredTestChangePpm,
        effective_test_ppm_per_product_ppm: effectiveTestResponse,
        required_product_ppm: requiredProductPpm,
        product_volume_liters: productVolumeLiters
      }
    };
  }

  function calculateUsProductDose(rawRequest) {
    const response = calculateProductDose(
      rawRequest,
      'pool_volume_us_gallons',
      (gallons) => gallons * LITERS_PER_US_GALLON
    );

    if (!response.ok) return response;

    const productVolumeUsGallons =
      response.data.product_volume_liters / LITERS_PER_US_GALLON;

    return {
      ok: true,
      data: {
        desired_test_change_ppm: response.data.desired_test_change_ppm,
        effective_test_ppm_per_product_ppm:
          response.data.effective_test_ppm_per_product_ppm,
        required_product_ppm: response.data.required_product_ppm,
        product_volume_us_gallons: productVolumeUsGallons,
        product_volume_us_fluid_ounces:
          productVolumeUsGallons * US_FLUID_OUNCES_PER_US_GALLON
      }
    };
  }

  function calculateMetricProductDose(rawRequest) {
    const response = calculateProductDose(
      rawRequest,
      'pool_volume_liters',
      (liters) => liters
    );

    if (!response.ok) return response;

    return {
      ok: true,
      data: {
        ...response.data,
        product_volume_milliliters:
          response.data.product_volume_liters * MILLILITERS_PER_LITER
      }
    };
  }

  function calculateMuriaticAcidDose(rawRequest, volumeField, volumeToLiters) {
    const normalized = normalizeRequest(rawRequest);
    if (!normalized.ok) return normalized;

    const request = normalized.value;
    const requiredFields = [
      'test_ph',
      'target_ph',
      'total_alkalinity_ppm',
      'percent_hcl',
      volumeField
    ];
    const missingFields = requiredFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(request, field)
    );

    if (missingFields.length > 0) {
      return errorResponse(
        'MISSING_FIELDS',
        `Missing required fields: ${missingFields.join(', ')}.`,
        missingFields
      );
    }

    const invalidNumberFields = requiredFields.filter(
      (field) => typeof request[field] !== 'number' || !Number.isFinite(request[field])
    );

    if (invalidNumberFields.length > 0) {
      return errorResponse(
        'INVALID_NUMBERS',
        'All request fields must be finite JSON numbers.',
        invalidNumberFields
      );
    }

    const outOfRangeFields = [];
    if (request.test_ph < 0 || request.test_ph > 14) outOfRangeFields.push('test_ph');
    if (request.target_ph < 0 || request.target_ph > 14) {
      outOfRangeFields.push('target_ph');
    }
    if (request.total_alkalinity_ppm < 0) {
      outOfRangeFields.push('total_alkalinity_ppm');
    }
    if (request.percent_hcl <= 0 || request.percent_hcl > REFERENCE_HCL_PERCENT) {
      outOfRangeFields.push('percent_hcl');
    }
    if (request[volumeField] <= 0) outOfRangeFields.push(volumeField);

    if (outOfRangeFields.length > 0) {
      return errorResponse(
        'VALUE_OUT_OF_RANGE',
        'pH values must be between 0 and 14; total alkalinity cannot be negative; percent_hcl must be greater than 0 and at most 31.45; pool volume must be positive.',
        outOfRangeFields
      );
    }

    const desiredPhReduction = Math.max(request.test_ph - request.target_ph, 0);
    const hclConcentrationFactor = REFERENCE_HCL_PERCENT / request.percent_hcl;
    const totalAlkalinityFactor =
      request.total_alkalinity_ppm / REFERENCE_TOTAL_ALKALINITY_PPM;
    const poolVolumeLiters = volumeToLiters(request[volumeField]);
    const poolVolumeUsGallons = poolVolumeLiters / LITERS_PER_US_GALLON;
    const acidVolumeUsFluidOunces =
      (desiredPhReduction / 0.1) *
      (poolVolumeUsGallons / 10000) *
      MURIATIC_ACID_US_FLUID_OUNCES_PER_10000_GALLONS_PER_POINT_1_PH *
      hclConcentrationFactor *
      totalAlkalinityFactor;
    const acidVolumeLiters =
      (acidVolumeUsFluidOunces / US_FLUID_OUNCES_PER_US_GALLON) *
      LITERS_PER_US_GALLON;

    return {
      ok: true,
      data: {
        desired_ph_reduction: desiredPhReduction,
        hcl_concentration_factor: hclConcentrationFactor,
        total_alkalinity_factor: totalAlkalinityFactor,
        muriatic_acid_volume_liters: acidVolumeLiters
      }
    };
  }

  function calculateUsMuriaticAcidDose(rawRequest) {
    console.log(rawRequest);
    const response = calculateMuriaticAcidDose(
      rawRequest,
      'pool_volume_us_gallons',
      (gallons) => gallons * LITERS_PER_US_GALLON
    );

    if (!response.ok) return response;

    const acidVolumeUsGallons =
      response.data.muriatic_acid_volume_liters / LITERS_PER_US_GALLON;

    return {
      ok: true,
      data: {
        desired_ph_reduction: response.data.desired_ph_reduction,
        hcl_concentration_factor: response.data.hcl_concentration_factor,
        total_alkalinity_factor: response.data.total_alkalinity_factor,
        muriatic_acid_volume_us_gallons: acidVolumeUsGallons,
        muriatic_acid_volume_us_fluid_ounces:
          acidVolumeUsGallons * US_FLUID_OUNCES_PER_US_GALLON
      }
    };
  }

  function calculateMetricMuriaticAcidDose(rawRequest) {
    const response = calculateMuriaticAcidDose(
      rawRequest,
      'pool_volume_liters',
      (liters) => liters
    );

    if (!response.ok) return response;

    return {
      ok: true,
      data: {
        ...response.data,
        muriatic_acid_volume_milliliters:
          response.data.muriatic_acid_volume_liters * MILLILITERS_PER_LITER
      }
    };
  }

  function calculateCyaDrainTime(
    rawRequest,
    volumeField,
    flowField,
    volumeToLiters,
    flowToLitersPerMinute
  ) {
    const normalized = normalizeRequest(rawRequest);
    if (!normalized.ok) return normalized;

    const request = normalized.value;
    const requiredFields = ['test_ppm', 'target_ppm', volumeField, flowField];
    const missingFields = requiredFields.filter(
      (field) => !Object.prototype.hasOwnProperty.call(request, field)
    );

    if (missingFields.length > 0) {
      return errorResponse(
        'MISSING_FIELDS',
        `Missing required fields: ${missingFields.join(', ')}.`,
        missingFields
      );
    }

    const invalidNumberFields = requiredFields.filter(
      (field) => typeof request[field] !== 'number' || !Number.isFinite(request[field])
    );

    if (invalidNumberFields.length > 0) {
      return errorResponse(
        'INVALID_NUMBERS',
        'All request fields must be finite JSON numbers.',
        invalidNumberFields
      );
    }

    const outOfRangeFields = [];
    if (request.test_ppm < 0) outOfRangeFields.push('test_ppm');
    if (request.target_ppm < 0) outOfRangeFields.push('target_ppm');
    if (request[volumeField] <= 0) outOfRangeFields.push(volumeField);
    if (request[flowField] <= 0) outOfRangeFields.push(flowField);

    if (outOfRangeFields.length > 0) {
      return errorResponse(
        'VALUE_OUT_OF_RANGE',
        'CYA values cannot be negative; pool volume and pump flow must be positive.',
        outOfRangeFields
      );
    }

    const drainFraction =
      request.test_ppm > request.target_ppm && request.test_ppm > 0
        ? 1 - request.target_ppm / request.test_ppm
        : 0;
    const poolVolumeLiters = volumeToLiters(request[volumeField]);
    const drainVolumeLiters = poolVolumeLiters * drainFraction;
    const pumpFlowLitersPerMinute = flowToLitersPerMinute(request[flowField]);
    const drainTimeMinutes = drainVolumeLiters / pumpFlowLitersPerMinute;

    return {
      ok: true,
      data: {
        drain_fraction: drainFraction,
        drain_percent: drainFraction * 100,
        drain_volume_liters: drainVolumeLiters,
        drain_time_minutes: drainTimeMinutes,
        drain_time_hours: drainTimeMinutes / 60
      }
    };
  }

  function calculateUsCyaDrainTime(rawRequest) {
    const response = calculateCyaDrainTime(
      rawRequest,
      'pool_volume_us_gallons',
      'pump_flow_us_gallons_per_minute',
      (gallons) => gallons * LITERS_PER_US_GALLON,
      (gallonsPerMinute) => gallonsPerMinute * LITERS_PER_US_GALLON
    );

    if (!response.ok) return response;

    return {
      ok: true,
      data: {
        drain_fraction: response.data.drain_fraction,
        drain_percent: response.data.drain_percent,
        drain_volume_us_gallons:
          response.data.drain_volume_liters / LITERS_PER_US_GALLON,
        drain_time_minutes: response.data.drain_time_minutes,
        drain_time_hours: response.data.drain_time_hours
      }
    };
  }

  function calculateMetricCyaDrainTime(rawRequest) {
    return calculateCyaDrainTime(
      rawRequest,
      'pool_volume_liters',
      'pump_flow_liters_per_minute',
      (liters) => liters,
      (litersPerMinute) => litersPerMinute
    );
  }

  function createOperation(requestTemplate, calculate) {
    return Object.freeze({
      request_template: requestTemplate,
      request: calculate,
      request_json(jsonRequest) {
        return JSON.stringify(calculate(jsonRequest));
      }
    });
  }

  // #endregion

  const FORM_INITIAL_VALUES = Object.freeze({
    volume: 10000,
    total_alkalinity: {
      test_ppm: 90,
      target_ppm: REFERENCE_TOTAL_ALKALINITY_PPM,
      active_ingredient_percent: 100,
      relative_mass: RELATIVE_MASSES.sodium_bicarbonate_to_total_alkalinity
    },

    ph: {
      test_ph: 7.8,
      target_ph: 7.5,
      total_alkalinity_ppm: REFERENCE_TOTAL_ALKALINITY_PPM,
      percent_hcl: 31.45,
    },

    free_chlorine: {
      test_ppm: 0.5,
      target_ppm: 2.0,
      active_ingredient_percent: 100,
      relative_mass: RELATIVE_MASSES.chlorine_cal_hypo_to_free_chlorine
    },

    calcium_hardness: {
      test_ppm: 200,
      target_ppm: 250,
      active_ingredient_percent: 94,
      relative_mass: RELATIVE_MASSES.calcium_chloride_dihydrate_to_calcium_hardness
    },

    cyanuric_acid: {
      test_ppm: 80,
      target_ppm: 40,
      active_ingredient_percent: 100,
      relative_mass: 1,
      pool_volume_us_gallons: 26000,
      pump_flow_us_gallons_per_minute: 40
    },

    borate: {
      test_ppm: 10,
      target_ppm: 50,
      active_ingredient_percent: 100,
      relative_mass: RELATIVE_MASSES.bioguard_optimizer_to_borate
    }
  })

  const ROOTPDX_POOL_API = Object.freeze({
    version: '0.1.0',
    RELATIVE_MASSES: RELATIVE_MASSES,
    FORM_INITIAL_VALUES: FORM_INITIAL_VALUES,
    ERROR_STATUS: ERROR_STATUS,
    calculate_us_product_dose_for_target_ppm: createOperation(
      usRequestTemplate,
      calculateUsProductDose
    ),
    calculate_metric_product_dose_for_target_ppm: createOperation(
      metricRequestTemplate,
      calculateMetricProductDose
    ),
    calculate_us_muriatic_acid_dose_for_target_ph: createOperation(
      usMuriaticAcidRequestTemplate,
      calculateUsMuriaticAcidDose
    ),
    calculate_metric_muriatic_acid_dose_for_target_ph: createOperation(
      metricMuriaticAcidRequestTemplate,
      calculateMetricMuriaticAcidDose
    ),
    calculate_us_drain_time_for_target_ppm: createOperation(
      usCyaDrainTimeRequestTemplate,
      calculateUsCyaDrainTime
    ),
    calculate_metric_drain_time_for_target_ppm: createOperation(
      metricCyaDrainTimeRequestTemplate,
      calculateMetricCyaDrainTime
    )
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ROOTPDX_POOL_API;
  }

  globalScope.ROOTPDX_POOL_API = ROOTPDX_POOL_API;


})(typeof globalThis !== 'undefined' ? globalThis : window);
