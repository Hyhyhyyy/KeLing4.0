package com.keling.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.keling.app.data.PlanetStyles

/** Same persisted index and original artwork on both platforms; phone images keep their aspect. */
@Composable
fun CoursePlanetArt(index: Int, modifier: Modifier = Modifier, description: String? = PlanetStyles.name(index)) {
    AsyncImage(
        model = "file:///android_asset/${PlanetStyles.assetPath(index)}",
        contentDescription = description,
        modifier = modifier,
        contentScale = ContentScale.Fit,
        filterQuality = FilterQuality.None
    )
}

@Composable
fun PlanetPickerDialog(
    title: String,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    busy: Boolean = false,
    error: String? = null,
    description: String = "为这门课程选择一个学习星球。"
) {
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(description, style = MaterialTheme.typography.bodySmall)
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(PlanetStyles.entries, key = { it.index }) { style ->
                        val selected = style.index == selectedIndex
                        Card(
                            modifier = Modifier.fillMaxWidth().selectable(
                                selected = selected, enabled = !busy, role = Role.RadioButton,
                                onClick = { onSelected(style.index) }
                            ),
                            border = BorderStroke(if (selected) 2.dp else 1.dp,
                                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                            colors = CardDefaults.cardColors(containerColor = if (selected)
                                MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface)
                        ) {
                            Column(Modifier.fillMaxWidth().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                CoursePlanetArt(style.index, Modifier.size(80.dp), description = null)
                                Text(style.name, textAlign = TextAlign.Center, style = MaterialTheme.typography.labelLarge)
                                Text(if (selected) "✓ 已选择" else "选择", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = { TextButton(onClick = onConfirm, enabled = !busy && selectedIndex in PlanetStyles.entries.indices) { Text(if (busy) "保存中…" else "确定选择") } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("取消") } }
    )
}
