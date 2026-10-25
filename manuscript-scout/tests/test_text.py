from scout.text import clean_subjects, coarse_genre, looks_english, scrub_promo, build_blurb_input


def test_scrub_removes_success_signals_but_keeps_premise():
    raw = ("A young cartographer discovers her city is shrinking. "
           "The #1 New York Times bestseller. "
           "Now a major Netflix series. "
           "\n“Unputdownable!” —The Guardian\n"
           "Winner of the Booker Prize. "
           "Over 3 million copies sold. "
           "She must map what is left before it vanishes.")
    out, removed = scrub_promo(raw)
    assert removed == 5
    assert "cartographer" in out and "vanishes" in out
    for leak in ("bestseller", "Netflix", "Guardian", "Booker", "million"):
        assert leak not in out


def test_clean_subjects_drops_bookkeeping_and_success_tags():
    subs = ["Fantasy", "nyt:hardcover-fiction=2012-05-06", "New York Times bestseller",
            "Award:hugo=1999", "Dragons", "fantasy", "Large type books", "Accessible book"]
    assert clean_subjects(subs) == ["Fantasy", "Dragons"]


def test_looks_english():
    assert looks_english("The detective was sure that she had seen the man in the park with his dog "
                         "and that it was the same one that had followed her to the station for days.")
    assert not looks_english("Ceci est un roman sur la vie d'une jeune femme qui quitte son village pour Paris.")


def test_coarse_genre_and_input_format():
    assert coarse_genre(["Romance", "Fiction"]) == "romance"
    assert coarse_genre(["Cooking"]) == "other"
    s = build_blurb_input("A tale. Bestselling author!", ["Fantasy"], title="Secret Title")
    assert s.startswith("Title: Secret Title") and "bestsell" not in s.lower()
    assert "Title:" not in build_blurb_input("A tale.", ["Fantasy"])
