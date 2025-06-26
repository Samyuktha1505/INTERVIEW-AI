import redis
from backend.config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_SSL

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    ssl=REDIS_SSL,
    decode_responses=True
)
# List all keys
keys = redis_client.keys('*')
print("Keys in Redis:", keys)

# For each key, get its type and value(s)
for key in keys:
    key_type = redis_client.type(key)
    print(f"\nKey: {key} (Type: {key_type})")

    if key_type == 'string':
        value = redis_client.get(key)
        print("Value:", value)

    elif key_type == 'hash':
        value = redis_client.hgetall(key)
        print("Hash fields and values:", value)

    elif key_type == 'list':
        value = redis_client.lrange(key, 0, -1)
        print("List values:", value)

    elif key_type == 'set':
        value = redis_client.smembers(key)
        print("Set members:", value)

    elif key_type == 'zset':
        value = redis_client.zrange(key, 0, -1, withscores=True)
        print("Sorted Set members with scores:", value)

    else:
        print("Unsupported key type or no data to show")
