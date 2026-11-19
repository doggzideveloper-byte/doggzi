from .conftest import API


def test_breeds_filtered_by_type_with_pinned_first(client):
    r = client.get(f"{API}/breeds", params={"type": "dog"})
    assert r.status_code == 200
    names = [b["name"] for b in r.json()]
    assert names[:2] == ["Indie / Desi", "Mixed / Not sure"]
    assert "Labrador Retriever" in names and "Persian" not in names
    assert all({"id", "name", "slug", "avatar_url", "pinned"} <= set(b) for b in r.json())
    assert len(names) >= 30


def test_breeds_search_is_case_insensitive(client):
    r = client.get(f"{API}/breeds", params={"type": "dog", "q": "LAB"})
    assert [b["name"] for b in r.json()] == ["Labrador Retriever"]


def test_cat_breeds(client):
    names = [b["name"] for b in client.get(f"{API}/breeds", params={"type": "cat"}).json()]
    assert names[0] == "Indian / Indie" and "Persian" in names and len(names) >= 12


def test_breeds_rejects_unknown_type(client):
    assert client.get(f"{API}/breeds", params={"type": "parrot"}).status_code == 422


def test_breeds_are_cached(client):
    first = client.get(f"{API}/breeds", params={"type": "cat", "q": "per"}).json()
    from app.core import cache

    assert cache.get("breeds:v1:cat:per") == first
