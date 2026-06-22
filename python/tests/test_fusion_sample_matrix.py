from collections import defaultdict

import pytest

from fusion_sample_harness import (
    EXPECTED_SAMPLE_COUNT,
    EXPECTED_SYNTAX_ERRORS,
    sample_inventory,
    resolve_adsk_symbol,
)


def _sample_names(samples):
    return ", ".join(sample.name for sample in samples[:5])


def _adsk_call_params():
    calls = defaultdict(list)
    for sample in sample_inventory():
        for call in sample.adsk_calls:
            calls[call].append(sample)

    params = []
    for call, samples in sorted(calls.items()):
        supported = resolve_adsk_symbol(call)
        reason = f"{call} used by {_sample_names(samples)}"
        if len(samples) > 5:
            reason += f", +{len(samples) - 5} more"
        marks = ()
        if not supported:
            marks = pytest.mark.xfail(reason=reason, strict=True)
        params.append(pytest.param(call, tuple(samples), supported, id=call, marks=marks))
    return params


def test_sample_inventory_covers_entire_corpus():
    if EXPECTED_SAMPLE_COUNT == 0:
        pytest.skip("Fusion sample corpus missing from repo, skipping matrix tests.")
    samples = sample_inventory()
    names = {sample.name for sample in samples}
    syntax_errors = {
        sample.name: sample.syntax_error for sample in samples if sample.syntax_error
    }

    assert len(samples) == EXPECTED_SAMPLE_COUNT
    assert names == {path.name for path in next(iter(samples)).path.parent.glob("*.py")}
    assert set(syntax_errors) == set(EXPECTED_SYNTAX_ERRORS)
    assert all(EXPECTED_SYNTAX_ERRORS[name] for name in syntax_errors)


def test_sample_inventory_records_entrypoints_and_calls():
    if EXPECTED_SAMPLE_COUNT == 0:
        pytest.skip("Fusion sample corpus missing from repo, skipping matrix tests.")
    samples = sample_inventory()
    parseable = [sample for sample in samples if not sample.syntax_error]
    with_run = [sample for sample in parseable if sample.has_run]
    without_run = {sample.name for sample in parseable if not sample.has_run}
    all_call_count = sum(len(sample.all_calls) for sample in parseable)
    adsk_call_count = sum(len(sample.adsk_calls) for sample in parseable)
    receiver_call_count = sum(len(sample.receiver_calls) for sample in parseable)

    assert len(parseable) == EXPECTED_SAMPLE_COUNT - len(EXPECTED_SYNTAX_ERRORS)
    assert len(with_run) == 129
    assert without_run == {"ConstantRadiusFillet_Sample.py"}
    assert all_call_count > 500
    assert adsk_call_count > 100
    assert receiver_call_count > 100
    assert all(all(call for call in sample.all_calls) for sample in parseable)


@pytest.mark.parametrize("call, samples, supported", _adsk_call_params())
def test_sample_adsk_call_is_accounted_for(call, samples, supported):
    assert samples
    assert resolve_adsk_symbol(call) is supported
    assert supported

