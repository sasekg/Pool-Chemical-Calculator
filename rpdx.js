const form = document.querySelector('#calculator');
const water_volume = document.querySelector('#water-volume');
const flow_rate = document.querySelector('#flow-rate');
const temperature = document.querySelector('#temperature');

// #region utility
function format_oz(result) {
  const oz = Number(result).toFixed(2);
  const val_unit = {
    val: oz,
    unit: 'oz'
  }

  if (oz >= 64) {
    const lb = Number(oz / 16).toFixed(2);
    val_unit.val = lb;
    val_unit.unit = "lb";
  }
  return val_unit;
}

function convertFtoC(fahrenheit) {
  return (fahrenheit - 32) * 5 / 9;
}
// #endregion

// #region ROOTPDX_POOL_API Calls
function calc_us_ppm(test, target, gal, active_pct, mass_ratio) {
  const response = ROOTPDX_POOL_API.calculate_us_product_dose_for_target_ppm.request({
    test_ppm: Number(test),
    target_ppm: Number(target),
    pool_volume_us_gallons: Number(gal),
    active_ingredient_percent: Number(active_pct),
    relative_mass: Number(mass_ratio)
  });

  if (response.ok) {
    return response.data.product_volume_us_fluid_ounces;
  } else {
    console.log(response);
  }
  return ROOTPDX_POOL_API.ERROR_STATUS;
}

function calculate_us_muriatic_acid_dose_for_target_ph(test, target, gal, percent_hcl, ta) {
  const response = ROOTPDX_POOL_API.calculate_us_muriatic_acid_dose_for_target_ph.request({
    test_ph: Number(test),
    target_ph: Number(target),
    total_alkalinity_ppm: Number(ta),
    percent_hcl: Number(percent_hcl),
    pool_volume_us_gallons: Number(gal)
  });

  if (response.ok) {
    return response.data.muriatic_acid_volume_us_fluid_ounces;
  } else {
    console.log(response);
  }
  return ROOTPDX_POOL_API.ERROR_STATUS;
}

function calc_us_drain_time_for_ppm(test, target, gal, active_pct, mass_ratio, gal_per_minute) {
  const response = ROOTPDX_POOL_API.calculate_us_drain_time_for_target_ppm.request({
    test_ppm: Number(test),
    target_ppm: Number(target),
    pool_volume_us_gallons: Number(gal),
    pump_flow_us_gallons_per_minute: Number(gal_per_minute),
    active_ingredient_percent: Number(active_pct),
    relative_mass: Number(mass_ratio)
  });

  if (response.ok) {
    return Number(response.data.drain_time_minutes);
  } else {
    console.log(response);
  }
  return ROOTPDX_POOL_API.ERROR_STATUS;
}

// #endregion

// #region get
function get_common_html_elements(pfx) {
  return {
    test: document.querySelector(`#${pfx}-test`),
    target: document.querySelector(`#${pfx}-target`),
    active: document.querySelector(`#${pfx}-active`),
    relative_mass: document.querySelector(`#${pfx}-relative-mass`),
    result_value: document.querySelector(`#${pfx}-result-value`),
    result_unit: document.querySelector(`#${pfx}-result-unit`)
  }
}

function get_ta_html_elements() {
  return get_common_html_elements('ta');
}

function get_ph_html_elements() {
  const o = get_common_html_elements('ph');
  o.total_alkalinity_for_ph_calculation = document.querySelector("#ph-total-alkalinity");
  return o;
}

function get_cl_html_elements() {
  return get_common_html_elements('cl');
}

function get_ch_html_elements() {
  return get_common_html_elements('ch');
}

function get_cya_html_elements() {
  const o = get_common_html_elements('cya');
  o.flow_rate = flow_rate;
  console.log(o);
  return o;
}

function get_borate_html_elements() {
  return get_common_html_elements('borate');
}

function get_html_elements() {
  const e = {
    volume: water_volume,
    flow_rate: flow_rate,
    temperature: temperature,
    ta: get_ta_html_elements(),
    ph: get_ph_html_elements(),
    fc: get_cl_html_elements(),
    ch: get_ch_html_elements(),
    cya: get_cya_html_elements(),
    borate: get_borate_html_elements(),
    cya_adjusted: {
      ta_result: document.querySelector('#cya-adjusted-ta-result-value'),
      fc_result: document.querySelector('#cya-adjusted-fc-result-value'),
      min_fc_result: document.querySelector('#cya-adjusted-min-fc-result-value'), 
    },
    lsi_result: document.querySelector('#calculated-lsi-result-value') 
  }
  return e;
}

function get_input_values() {
  const o = get_html_elements();
  const values = {
    volume: o.volume.value,
    flow_rate: o.flow_rate.value,
    temperature: o.temperature.value,
    ta_test: o.ta.test.value, 
    ph_test: o.ph.test.value,
    fc_test: o.fc.test.value,
    ch_test: o.ch.test.value,
    cya_test: o.cya.test.value,
    borate_test: o.borate.test.value
  }
  return values;
}
// #endregion

// #region calc
function calc_total_alkalinity() {
  if (!form.checkValidity()) {
    reset_total_alkalinity_result();
    console.log(form);
    return;
  }

  const o = get_ta_html_elements();

  const result = calc_us_ppm(
    o.test.value,
    o.target.value,
    water_volume.value,
    o.active.value,
    o.relative_mass.value
  );

  console.log(result);
  if (result == ROOTPDX_POOL_API.ERROR_STATUS) {
    return;
  }

  const val_unit = format_oz(result);
  o.result_value.innerHTML = val_unit.val;
  o.result_unit.innerHTML = val_unit.unit;
}

function calc_free_chlorine() {
  if (!form.checkValidity()) {
    reset_cl_result();
    console.log(form);
    return;
  }

  const o = get_cl_html_elements();

  const result = calc_us_ppm(
    o.test.value,
    o.target.value,
    water_volume.value,
    o.active.value,
    o.relative_mass.value
  );

  console.log(result);
  if (result == ROOTPDX_POOL_API.ERROR_STATUS) {
    return;
  }

  const val_unit = format_oz(result);
  o.result_value.innerHTML = val_unit.val;
  o.result_unit.innerHTML = val_unit.unit;
}

function calc_calcium_hardness() {
  if (!form.checkValidity()) {
    reset_calcium_hardness_result();
    console.log(form);
    return;
  }

  const o = get_ch_html_elements();

  const result = calc_us_ppm(
    o.test.value,
    o.target.value,
    water_volume.value,
    o.active.value,
    o.relative_mass.value
  );

  console.log(result);
  if (result == ROOTPDX_POOL_API.ERROR_STATUS) {
    return;
  }

  const val_unit = format_oz(result);
  o.result_value.innerHTML = val_unit.val;
  o.result_unit.innerHTML = val_unit.unit;
}

function calc_cyanuric_acid_drain_volume() {
  if (!form.checkValidity()) {
    reset_cyanuric_acid_result
    console.log(form);
    return;
  }

  const o = get_cya_html_elements();

  const minutes = calc_us_drain_time_for_ppm(
    o.test.value,
    o.target.value,
    water_volume.value,
    o.active.value,
    o.relative_mass.value,
    o.flow_rate.value
  );

  console.log(minutes);
  if (minutes == ROOTPDX_POOL_API.ERROR_STATUS) {
    return;
  }

  const hours_part = String(Number(minutes / 60).toFixed(0));
  const minutes_part = String(Number(minutes % 60).toFixed(0));
  const formattedMinutes = String(minutes_part).padStart(2, "0");

  o.result_value.innerHTML = hours_part + ":" + formattedMinutes;
  o.result_unit.innerHTML = 'hh:mm';
}

function calc_ph() {
  if (!form.checkValidity()) {
    reset_ph_result();
    console.log(form);
    return;
  }

  const o = get_ph_html_elements();

  const result = calculate_us_muriatic_acid_dose_for_target_ph(
    o.test.value,
    o.target.value,
    water_volume.value,
    o.active.value,
    o.total_alkalinity_for_ph_calculation.value
  );

  console.log(result);
  if (result == ROOTPDX_POOL_API.ERROR_STATUS) {
    return;
  }

  const val_unit = format_oz(result);
  o.result_value.innerHTML = val_unit.val;
  o.result_unit.innerHTML = val_unit.unit;
}

function calc_borate() {
  if (!form.checkValidity()) {
    reset_borate_result();
    console.log(form);
    return;
  }

  const o = get_borate_html_elements();

  const result = calc_us_ppm(
    o.test.value,
    o.target.value,
    water_volume.value,
    o.active.value,
    o.relative_mass.value
  );

  console.log(result);
  if (result == ROOTPDX_POOL_API.ERROR_STATUS) {
    return;
  }

  const val_unit = format_oz(result);
  o.result_value.innerHTML = val_unit.val;
  o.result_unit.innerHTML = val_unit.unit;
}

function calcTotalAlkalinityWithPHandCYA() {
  const o = get_input_values();
  const v = ROOTPDX_POOL_API.calcTotalAlkalinityWithPHandCYA(o.ta_test, o.ph_test, o.cya_test);
  const e = document.querySelector('#cya-adjusted-ta-result-value');
  e.innerHTML = Number(v).toFixed(2);
}

function calcActiveChlorineWithCYA() {
  const o = get_input_values();
  const v = ROOTPDX_POOL_API.calcActiveChlorineWithCYA(o.fc_test, o.cya_test);
  const e = document.querySelector('#cya-adjusted-fc-result-value');
  e.innerHTML = Number(v).toFixed(4);
}

function calcMinimumFCbyCYA() {
  const o = get_input_values();
  const v = ROOTPDX_POOL_API.calcMinimumFCbyCYA(o.cya_test);
  const e = document.querySelector('#cya-adjusted-min-fc-result-value');
  e.innerHTML = Number(v).toFixed(4);
}

function calcMetricLSI() {
  const o = get_input_values();
  const v = ROOTPDX_POOL_API.calcMetricLSI(
    o.ph_test, 
    convertFtoC(o.temperature),
    o.ch_test,
    o.ta_test,
    12.1,
    o.cya_test);
  const e = document.querySelector('#calculated-lsi-result-value');
  e.innerHTML = Number(v).toFixed(4);
}

function calculate() {
  calc_total_alkalinity();
  calc_ph();
  calc_free_chlorine();
  calc_calcium_hardness();
  calc_cyanuric_acid_drain_volume();
  calc_borate();
  calcTotalAlkalinityWithPHandCYA();
  calcActiveChlorineWithCYA();
  calcMinimumFCbyCYA();
  calcMetricLSI();
}
// #endregion

// #region reset
function reset_cyanuric_acid_result() {
  const o = get_cya_html_elements();
  o.result_value.innerHTML = '';
  o.result_unit.innerHTML = '';
}

function reset_cyanuric_acid() {
  const o = get_cya_html_elements();
  const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.cyanuric_acid;

  o.test.value = v.test_ppm;
  o.target.value = v.target_ppm;
  o.active.value = v.active_ingredient_percent.toLocaleString(undefined, { maximumFractionDigits: 1 });
  o.relative_mass.value = v.relative_mass.toLocaleString(undefined, { maximumFractionDigits: 4 });
  o.flow_rate.value = v.pump_flow_us_gallons_per_minute;

  reset_cyanuric_acid_result();
}

function reset_calcium_hardness_result() {
  const o = get_ch_html_elements();
  o.result_value.innerHTML = '';
  o.result_unit.innerHTML = '';
}

function reset_calcium_hardness() {
  const o = get_ch_html_elements();
  const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.calcium_hardness;

  o.test.value = v.test_ppm;
  o.target.value = v.target_ppm;
  o.active.value = v.active_ingredient_percent.toLocaleString(undefined, { maximumFractionDigits: 1 });
  o.relative_mass.value = v.relative_mass.toLocaleString(undefined, { maximumFractionDigits: 4 });

  reset_calcium_hardness_result();
}

function reset_total_alkalinity_result() {
  const o = get_ta_html_elements();
  o.result_value.innerHTML = '';
  o.result_unit.innerHTML = '';
}

function reset_total_alkalinity() {
  const o = get_ta_html_elements();
  const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.total_alkalinity;

  o.test.value = v.test_ppm;
  o.target.value = v.target_ppm;
  o.active.value = v.active_ingredient_percent.toLocaleString(undefined, { maximumFractionDigits: 1 });
  o.relative_mass.value = v.relative_mass.toLocaleString(undefined, { maximumFractionDigits: 4 });

  reset_total_alkalinity_result();
}

function reset_ph_result() {
  const html = get_ph_html_elements();
  html.result_value.innerHTML = '';
  html.result_unit.innerHTML = '';
}

function reset_ph() {
  const o = get_ph_html_elements();
  const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.ph;

  o.test.value = v.test_ph;
  o.target.value = v.target_ph;
  o.active.value = v.percent_hcl;
  o.total_alkalinity_for_ph_calculation.value = v.total_alkalinity_ppm;

  reset_ph_result();
}

function reset_cl_result() {
  const html = get_cl_html_elements();
  html.result_value.innerHTML = '';
  html.result_unit.innerHTML = '';
}

function reset_cl() {
  const o = get_cl_html_elements();
  const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.free_chlorine;

  o.test.value = v.test_ppm;
  o.target.value = v.target_ppm;
  o.active.value = v.active_ingredient_percent;
  o.relative_mass.value = Number(v.relative_mass).toFixed(4);

  reset_cl_result();
}

function reset_borate_result() {
  const html = get_borate_html_elements();
  html.result_value.innerHTML = '';
  html.result_unit.innerHTML = '';
}

function reset_borate() {
  const o = get_borate_html_elements();
  const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.borate;

  o.test.value = v.test_ppm;
  o.target.value = v.target_ppm;
  o.active.value = v.active_ingredient_percent;
  o.relative_mass.value = Number(v.relative_mass).toFixed(4);

  reset_borate_result();
}


function reset() {
  water_volume.value = 10000;
  reset_total_alkalinity();
  reset_ph();
  reset_cl();
  reset_calcium_hardness();
  reset_cyanuric_acid();
  reset_borate();
  calculate();
}

// #endregion

reset();

form.addEventListener('input', calculate);
