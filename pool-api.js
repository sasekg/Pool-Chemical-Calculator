(function (globalScope) {
  'use strict';

  const LITERS_PER_US_GALLON = 3.785411784;
  const US_FLUID_OUNCES_PER_US_GALLON = 128;
  const MILLILITERS_PER_LITER = 1000;
  const PARTS_PER_MILLION = 1 / 1_000_000;
  const MURIATIC_ACID_US_FLUID_OUNCES_PER_10000_GALLONS_PER_POINT_1_PH = 6;
  const REFERENCE_HCL_PERCENT = 31.45;
  const REFERENCE_TOTAL_ALKALINITY_PPM = 100;

  const commonRequestTemplate = Object.freeze({
    current_test_ppm: 2,
    target_test_ppm: 3,
    active_ingredient_fraction: 0.3145,
    test_ppm_per_active_ingredient_ppm: 0.2
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

    if (request.current_test_ppm < 0) outOfRangeFields.push('current_test_ppm');
    if (request.target_test_ppm < 0) outOfRangeFields.push('target_test_ppm');
    if (request[volumeField] <= 0) outOfRangeFields.push(volumeField);
    if (
      request.active_ingredient_fraction <= 0 ||
      request.active_ingredient_fraction > 1
    ) {
      outOfRangeFields.push('active_ingredient_fraction');
    }
    if (request.test_ppm_per_active_ingredient_ppm <= 0) {
      outOfRangeFields.push('test_ppm_per_active_ingredient_ppm');
    }

    if (outOfRangeFields.length > 0) {
      return errorResponse(
        'VALUE_OUT_OF_RANGE',
        'PPM values cannot be negative; pool volume and the response factor must be positive; active_ingredient_fraction must be greater than 0 and at most 1.',
        outOfRangeFields
      );
    }

    return { ok: true };
  }

  function calculateProductDose(rawRequest, volumeField, volumeToLiters) {
    const normalized = normalizeRequest(rawRequest);
    if (!normalized.ok) return normalized;

    const request = normalized.value;
    const validation = validateRequest(request, volumeField);
    if (!validation.ok) return validation;

    const desiredTestChangePpm = Math.max(
      request.target_test_ppm - request.current_test_ppm,
      0
    );
    const effectiveTestResponse =
      request.active_ingredient_fraction *
      request.test_ppm_per_active_ingredient_ppm;
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

  function createOperation(requestTemplate, calculate) {
    return Object.freeze({
      request_template: requestTemplate,
      request: calculate,
      request_json(jsonRequest) {
        return JSON.stringify(calculate(jsonRequest));
      }
    });
  }

  const ROOTPDX_POOL_API = Object.freeze({
    version: '0.1.0',
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
    )
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ROOTPDX_POOL_API;
  }

  globalScope.ROOTPDX_POOL_API = ROOTPDX_POOL_API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
