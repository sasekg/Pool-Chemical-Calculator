(function (globalScope) {
  'use strict';

  const OUNCES_PER_GALLON = 128;
  const PARTS_PER_MILLION = 1 / 1_000_000;

  const requestTemplate = Object.freeze({
    current_test_ppm: 2,
    target_test_ppm: 3,
    pool_gallons: 26000,
    active_ingredient_fraction: 0.3145,
    test_ppm_per_active_ingredient_ppm: 0.2
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

  function validateRequest(request) {
    const requiredFields = Object.keys(requestTemplate);
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
    if (request.pool_gallons <= 0) outOfRangeFields.push('pool_gallons');
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
        'PPM values cannot be negative; pool_gallons and the response factor must be positive; active_ingredient_fraction must be greater than 0 and at most 1.',
        outOfRangeFields
      );
    }

    return { ok: true };
  }

  function calculatePpmDose(rawRequest) {
    const normalized = normalizeRequest(rawRequest);
    if (!normalized.ok) return normalized;

    const request = normalized.value;
    const validation = validateRequest(request);
    if (!validation.ok) return validation;

    const desiredTestChangePpm = Math.max(
      request.target_test_ppm - request.current_test_ppm,
      0
    );
    const effectiveTestResponse =
      request.active_ingredient_fraction *
      request.test_ppm_per_active_ingredient_ppm;
    const requiredProductPpm = desiredTestChangePpm / effectiveTestResponse;
    const productGallonsVolumeEquivalent =
      request.pool_gallons * requiredProductPpm * PARTS_PER_MILLION;
    const productOuncesVolumeEquivalent =
      productGallonsVolumeEquivalent * OUNCES_PER_GALLON;

    return {
      ok: true,
      data: {
        desired_test_change_ppm: desiredTestChangePpm,
        effective_test_ppm_per_product_ppm: effectiveTestResponse,
        required_product_ppm: requiredProductPpm,
        product_gallons_volume_equivalent: productGallonsVolumeEquivalent,
        product_ounces_volume_equivalent: productOuncesVolumeEquivalent
      }
    };
  }

  const ROOTPDX_POOL_API = Object.freeze({
    version: '0.1.0',
    calculate_ppm_dose: Object.freeze({
      request_template: requestTemplate,
      request: calculatePpmDose,
      request_json(jsonRequest) {
        return JSON.stringify(calculatePpmDose(jsonRequest));
      }
    })
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ROOTPDX_POOL_API;
  }

  globalScope.ROOTPDX_POOL_API = ROOTPDX_POOL_API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
