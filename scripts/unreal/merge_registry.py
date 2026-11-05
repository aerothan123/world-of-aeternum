"""Merge the tier-1 registry into the main registry (tier-1 wins) and print the entry count."""
import json
import sys

main_p, t1_p = sys.argv[1], sys.argv[2]
main = json.load(open(main_p))
main.update(json.load(open(t1_p)))
json.dump(main, open(main_p, 'w'), indent=1, sort_keys=True)
print(len(main))
