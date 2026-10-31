package com.keling.app.data

/** Index is the shared API identifier; never reorder these ten styles. */
data class PlanetStyle(val index: Int, val name: String, val asset: String) {
    val assetPath: String get() = "stellar/$asset.webp"
}

object PlanetStyles {
    val entries = listOf("翡翠书环", "珊瑚火山", "极光冰晶", "琥珀沙丘", "云海雷霆", "深海潮汐", "苔原花园", "紫晶洞窟", "机械星核", "银月陨坑")
        .mapIndexed { index, name -> PlanetStyle(index, name, "planet_${(index + 1).toString().padStart(2, '0')}") }
    fun requireIndex(index: Int) { require(index in entries.indices) { "请选择十款星球中的一种" } }
    fun name(index: Int): String = entries.getOrNull(index)?.name ?: "经典星球"

    /** Keep legacy indices 10..25 readable without rewriting stored courses. */
    fun assetPath(index: Int, courseId: String = ""): String {
        if (index < 0) return entries[Math.floorMod(courseId.hashCode(), entries.size)].assetPath
        return entries.getOrNull(index)?.assetPath
            ?: if (index in 10..25) "legacy-planets/planet-${index.toString().padStart(2, '0')}.png" else entries.first().assetPath
    }
}
