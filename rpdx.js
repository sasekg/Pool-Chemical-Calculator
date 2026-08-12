    const form = document.querySelector('#calculator');
    const gallons = document.querySelector('#gallons');

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
      o.total_alkalinity = document.querySelector("#ph-total-alkalinity");
      return o;
    }

    function get_cl_html_elements() {
      return get_common_html_elements('cl');
    }

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
        gallons.value,
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
        gallons.value,
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
        gallons.value,
        o.active.value,
        o.total_alkalinity.value
      );

      console.log(result);
      if (result == ROOTPDX_POOL_API.ERROR_STATUS) {
        return;
      }

      const val_unit = format_oz(result);
      o.result_value.innerHTML = val_unit.val;
      o.result_unit.innerHTML = val_unit.unit;
    }

    function calculate() {
      calc_total_alkalinity();
      calc_ph();
      calc_free_chlorine();
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

    function reset_cl_result() {
      const html = get_cl_html_elements();
      html.result_value.innerHTML = '';
      html.result_unit.innerHTML = '';
    }

    function reset_ph() {
      const o = get_ph_html_elements();
      const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.ph;

      o.test.value = v.test_ph;
      o.target.value = v.target_ph;
      o.active.value = v.percent_hcl;
      o.total_alkalinity.value = v.total_alkalinity_ppm;

      reset_ph_result();
    }

    function reset_cl() {
      const o = get_cl_html_elements();
      const v = ROOTPDX_POOL_API.FORM_INITIAL_VALUES.free_chlorine;

      o.test.value = v.test;
      o.target.value = v.target;
      o.active.value = v.active_ingredient_percent;
      o.relative_mass.value = Number(v.relative_mass).toFixed(4);

      reset_cl_result();
    }

    function reset() {
      gallons.value = 10000;
      reset_total_alkalinity();
      reset_ph();
      reset_cl();
      calculate();
    }

    reset();

    form.addEventListener('input', calculate);
