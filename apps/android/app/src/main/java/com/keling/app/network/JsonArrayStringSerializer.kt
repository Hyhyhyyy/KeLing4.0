package com.keling.app.network

import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.*

/** Old backups use a JSON string; the HTTP API returns a real JSON array. */
object JsonArrayStringSerializer : JsonTransformingSerializer<String>(String.serializer()) {
    override fun transformDeserialize(element: JsonElement): JsonElement =
        if (element is JsonArray) JsonPrimitive(element.toString()) else element
    override fun transformSerialize(element: JsonElement): JsonElement =
        Json.parseToJsonElement(element.jsonPrimitive.content).also { require(it is JsonArray) }
}
